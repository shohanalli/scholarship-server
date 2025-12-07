const express = require('express')
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
require('dotenv').config()
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


    //send user data mongodb with fairbase
    app.post('/users', async(req,res)=>{
     const user = req.body;
      user.role = 'user';
      user.createAt = new Date();
      const email = user.email
        const userExist = await usersCollection.findOne({email})
          if(userExist){
            return res.send({message : 'user already exist'})
          }
      const result = await usersCollection.insertOne(user);
      res.send(result);

    })





    //schollerShip Api
    app.get('/scholarships', async(req,res)=>{

    })

    app.post('/scholarships', async(req,res)=>{

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