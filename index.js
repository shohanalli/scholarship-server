require('dotenv').config()
const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const port = process.env.port || 3000
const admin = require("firebase-admin");
const serviceAccount = require("./scholarship.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

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
    const applicationsCollection = db.collection('applications')
    const paymentsCollection = db.collection('payments')

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







//######################Scholarship related api ******************

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

//Applications and payment collection send data in database&&&&&
app.post('/applications', async(req,res)=>{
  try{
    const applicationData = req.body;
    const applicationId = new ObjectId();
    applicationData.applicationId = applicationId.toString();
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


//######################### Payment related api**********************
    // get one data for payment
    app.get('/scholarships/payment/:scholarId', async(req,res)=>{
      const id = req.params.scholarId;
      const query = { _id: new ObjectId(id)}
      const result = await scholarshipsCollection.findOne(query);
      res.send(result)
    })
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
        scholarshipId: paymentInfo.scholarshipId,
        userEmail: paymentInfo.userEmail,
      },
      customer_email: paymentInfo.userEmail,
      mode: 'payment',
    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancel`,
    });

    res.send({ url: session.url });
  } catch (err) {
    console.log(err);
    res.status(500).send("Stripe checkout creation failed");
  }
});
////Payment success
app.patch('/payment-success', async(req,res)=>{
  const sessionId = req.query.session_id;
   const session = await stripe.checkout.sessions.retrieve(sessionId);
  //  console.log(session)
 
   const trackingId = session.metadata.tracking;
   if(session.payment_status === 'paid'){ 
    const id = session.metadata.parcelId;
    const query = { _id: new ObjectId(id)}
    const update ={
      $set:{
        paymentStatus: 'paid',
      }
    }
    const result = await parcelCollection.updateOne(query, update)
    const payment = {
      amount: session.amount_total/100,
      currency: session.currency,
      customerEmail: session.customer_email || session.metadata.senderEmail || "example@get.com",
      parcelName: session.metadata.parcelName,
      parcelId: session.metadata.parcelId,
      transactionId: session.payment_intent,
      paymentStatus: session.payment_status,
      paidAt: new Date(),
      trackingId: trackingId
      
    }
      
      

    

   }

  return res.send({success: false})
})








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