require('dotenv').config()
const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto')
const port = process.env.port || 3000
const admin = require("firebase-admin");
const serviceAccount = require("./scholarship.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// generat id for traking
function generateTrackingId() {
  const prefix = "SS";  // your brand/company code
  
  // date as YYYYMMDD
  const date = new Date()
    .toISOString()
    .slice(0,10)
    .replace(/-/g, "");

  // secure random string (Base36)
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();

  return `${prefix}-${date}-${random}`;
}

//middleware
app.use(express.json());
app.use(cors());
const verifyToken = async(req, res, next) =>{
 const token = req.headers?.authorization;
  //  console.log('after verify', token)
  if(!token){
    return res.status(401).send({message: 'unauthorize access'})
  }
  try{
    const idToken = token.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken)
    req.decoded_email = decoded.email
    console.log('after decoded : ', decoded);

     next()
  }
catch (err){
 return res.status(401).send({message: 'unauthorized access'})
}

}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.11tuu0x.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const db = client.db('ScholarStream');
    const scholarshipsCollection = db.collection('scholarships');
    const usersCollection = db.collection('users');
    const applicationsCollection = db.collection('applications');
    const paymentsCollection = db.collection('payments');
    const reviewCollection = db.collection('reviews')

    //######################user related api ******************
    //send user data mongodb with fairbase
    app.post('/users', async(req,res)=>{
     const user = req.body;
      user.role = 'student';
      user.createAt = new Date();
      const email = user.email
        const userExist = await usersCollection.findOne({email})
          if(userExist){
            return res.send({message : 'user already exist'})
          }
      const result = await usersCollection.insertOne(user);
      res.send(result);

    });
    //find user role with email
    app.get('/users/:email/role', async(req, res)=>{
      const email = req.params.email
      const query = {email}
      const user = await usersCollection.findOne(query)
      res.send({role : user?.role || 'student'})

    });
    // find user for user profile
app.get('/users/:email', async(req,res)=>{
try{
    const email = req.params.email;
  const query = {email};
  const user = await usersCollection.find(query).toArray();
  res.send (user)
}
catch(error){
console.log("line number 98", error)
}
});

//######################Scholarship related api ******************
// send data in databes form admin dashboard
app.post('/scholarships', async(req, res)=>{
  const scholarInfo = req.body;
  const result = await scholarshipsCollection.insertOne(scholarInfo);
res.send (result);
})

 //schollerShip Api for home and all Scholarship page
    app.get('/scholarships', async(req,res)=>{
      try{
        const result = await scholarshipsCollection.find().sort({ApplicationFees: 1 , PostDate: -1 }).toArray();
        res.send(result)
      }catch(err){
        res.send('Something wrong scholarship Api');
      }
    });
//api for scholarship details page
    app.get('/scholarships/:id', async(req,res)=>{
      try{
        const id = req.params.id;
        const query = { _id: new ObjectId(id)}

        const result = await scholarshipsCollection.findOne(query);
        res.send(result)
      }catch(err){
        res.send('Something wrong scholarship details Api');
      }
    });








//######################Applications Collection related api ******************

//Applications collection send data in database&&&&&
app.post('/applications', async(req,res)=>{
  try{
    const applicationData = req.body;
    //application collection data save to db
    const applicationResult = await applicationsCollection.insertOne(applicationData);
    // payment collection save to payment
    // const paymentData = {
    //   applicationId: applicationId.toString(),
    //   userEmail: applicationData.userEmail,
    //   userName: applicationData.userName,
    //   amount: applicationData.applicationFees,
    //   scholarshipId: applicationData.scholarshipId,
    //   scholarshipName: applicationData.scholarshipName,
    //   paymentStatus: "unpaid",
    //   status: 'pending',
    //   createdAt: new Date()
    // };
    // const paymentResult = await paymentsCollection.insertOne(paymentData);


    res.send(applicationResult );
  }catch(err){
        res.send('Something wrong applicationsCollection post data');
      };
});


///create application get api 
app.get('/applications', async(req, res)=>{
  const query = {}
  const { email } = req.query;
  if(email){
    query.userEmail = email;
  }
  const result = await applicationsCollection.find(query).sort({applicationDate: -1}).toArray();
  res.send(result);
});
// get application for application details
app.get('/applications/:id', async(req,res)=>{
  try{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)};
    const result = await applicationsCollection.findOne(query);
    res.send(result);
  }catch(err){
    res.send('something wrong application details api')
  }
});
//delete application data
app.delete('/application/:id', async(req,res)=>{
  const id = req.params.id;
  const query = {_id: new ObjectId(id)};
  const result = await applicationsCollection.deleteOne(query);
  res.send(result);
});




//######################### Payment related api**********************
    // get one data for payment
    // app.get('/scholarships/payment/:scholarId', async(req,res)=>{
    //   const id = req.params.scholarId;
    //   const query = { _id: new ObjectId(id)}
    //   const result = await scholarshipsCollection.findOne(query);
    //   res.send(result)
    // })
    //##############Payment  checkout with stripe***************************
app.post('/create-checkout-section', async (req, res) => {
  try {
    const paymentInfo = req.body;
    const amount = parseInt(paymentInfo.applicationFees) * 100;

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: paymentInfo.scholarshipName,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        scholarshipName: paymentInfo.scholarshipName,
        applicationId: paymentInfo.applicationId,
        userEmail: paymentInfo.userEmail,
        universityName: paymentInfo.universityName,
        status: paymentInfo.status
      },
      customer_email: paymentInfo.userEmail,
      mode: 'payment',
    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel?session_id={CHECKOUT_SESSION_ID}`,
    
    });

    res.send({ url: session.url });
  } catch (err) {
    console.log(err);
    res.status(500).send("Stripe checkout creation failed");
  }
});
////Payment success and send data in DB
app.patch('/payment-success', async(req,res)=>{
  const sessionId = req.query.session_id;
   const session = await stripe.checkout.sessions.retrieve(sessionId);
//duplicate payment  handel
  const transactionId = session.payment_intent;
const paymentExist = await paymentsCollection.findOne({ transactionId });
if (paymentExist) {
  return res.send({
    success: false,
    message: "Payment already processed",
    paymentInfo: paymentExist
  });
}
    if (session.payment_status !== "paid") {
      return res.send({ success: false, message: "Payment not completed" });
    }

    const trackingId = generateTrackingId()
    const id = session.metadata.applicationId;

    const query = { _id: new ObjectId(id)};

    const update ={
      $set:{
        paymentStatus: 'paid',
        trackingId: trackingId
      }
    }
    const result = await applicationsCollection.updateOne(query, update);

    const payment = {
      amount: session.amount_total/100,
      currency: session.currency,
      customerEmail: session.customer_email || session.metadata.userEmail || "example@get.com",
      scholarshipName: session.metadata.scholarshipName,
      applicationId: session.metadata.applicationId,
      transactionId: session.payment_intent,
      paymentStatus: session.payment_status,
      paidAt: new Date(),
      trackingId: trackingId,
      universityName: session.metadata.universityName,
      status: session.metadata.status
    }         
      const paymentResult = await paymentsCollection.insertOne(payment);   
      return res.send({
        modifyScholar: result,
        paymentInfo: paymentResult,
        success:true,
        transactionId: session.payment_intent,
        trackingId: trackingId,
        scholarshipName: session.metadata.scholarshipName,
        universityName: session.metadata.universityName,
        amount: session.amount_total/100,
      })
   
   

res.send({success: false});
});
////Payment *****cancel**** and send data in DB
app.patch('/payment-cancel', async(req,res)=>{
  const sessionId = req.query.session_id;
   const session = await stripe.checkout.sessions.retrieve(sessionId);
    const transactionId = session.payment_intent || sessionId;
//duplicate payment  handel
    const paymentExist = await paymentsCollection.findOne({ transactionId, applicationId: session.metadata.applicationId});
    if(paymentExist){
      return res.send(paymentExist);
    }

    const trackingId = generateTrackingId()
    const applicationId = session.metadata.applicationId;
    // Update application - trackingId only
    const result = await applicationsCollection.updateOne(
      { _id: new ObjectId(applicationId)},
      { $set: { trackingId } }
    );


    
    const payment = {
      amount: session.amount_total/100,
      currency: session.currency,
      customerEmail: session.customer_email || session.metadata.userEmail || "example@get.com",
      scholarshipName: session.metadata.scholarshipName,
      applicationId: session.metadata.applicationId,
      transactionId,
      paidAt: new Date(),
      trackingId: trackingId,
      universityName: session.metadata.universityName,
      status: session.metadata.status,
      paymentStatus: "unpaid",
    }
  
      const paymentResult = await paymentsCollection.insertOne(payment);
   
      return res.send({
        modifyScholar: result,
        paymentInfo: paymentResult,
        success:true,
        transactionId,
        trackingId: trackingId,
        scholarshipName: session.metadata.scholarshipName,
        universityName: session.metadata.universityName,
        amount: session.amount_total/100,
      });

   

res.send({success: false});
});
//////###################### reviewCollection related work *************************
app.post('/reviews', async(req,res)=>{
  try{
  const reviewsData = req.body;
  const result = await reviewCollection.insertOne(reviewsData);
  res.send (result)
  }catch(err){
    console.log(err);
  }
});
app.get('/reviews', async(req,res)=>{
  try{
   const query = {};
   const { email } = req.query;
    if(email){
      query.userEmail = email
    }
    const result = await reviewCollection.find(query).sort({ reviewDate: -1 }).toArray();
    res.send(result);

  }catch(error){
    console.log('reviews get api problem', error);
  }
});
//delete Reviews data
app.delete('/reviews/:id', async(req,res)=>{
  const id = req.params.id;
  const query = {_id: new ObjectId(id)};
  const result = await reviewCollection.deleteOne(query);
  res.send(result);
})
// upadte  review for student
app.patch('/reviews/:id', async (req, res) => {
  const { reviewComment, rating } = req.body;
  const query = { _id: new ObjectId(req.params.id)}
  const updateReview = {
     $set: {
       reviewComment,
        rating 
      }
  }
  const result = await reviewCollection.updateOne(query, updateReview);
  res.send(result);
});



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("ScholarStream connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.get('/', (req, res) => {
  res.send('Assignment 11')
})
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})