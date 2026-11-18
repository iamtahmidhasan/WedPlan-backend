import express from "express"
import cors from "cors"
import 'dotenv/config';
import { MongoClient, ObjectId } from "mongodb";

const app = express()
const PORT = 5000
app.use(express.json())
app.use(cors())
const DB_URI = process.env.DATABASE_URL;
const client = new MongoClient(DB_URI)

export async function connectToMongoDB(){
    try {
        await client.connect()
        console.log("You Successfully connected to MongoDB!")
        return client

    } catch (error) {
        console.dir(error)
    }
}

const mongoClient = await connectToMongoDB()
const db = mongoClient.db("WedPlan")
const servicesCollection = db.collection("Services")
const usersCollection = db.collection("user")
const bookingsCollection = db.collection("Bookings")


app.get("/users", async(req,res)=>{
    const result = await usersCollection.find().toArray()
    res.status(200).send(result)
})
app.get("/users/:id", async (req, res) => {
    const { id } = req.params;
    const query = { _id: new ObjectId(id) }

    const result = await usersCollection.findOne(query);
    if (!result) {
        return res.status(404).send({ error: "User not found" });
    }
    res.send(result);
});

app.patch("/users/:id", async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    const query ={ _id: new ObjectId(id) }

    const result = await usersCollection.updateOne(query, { $set: updateData });
    res.send(result);
});
app.delete("/users/:id", async (req, res) => {
    const { id } = req.params;
    const query = { _id: new ObjectId(id) }
    const result = await usersCollection.deleteOne(query);
    res.status(200).send(result);
});

app.get("/services", async(req,res)=>{
    const result = await servicesCollection.find().toArray()
    res.status(200).send(result)
})
app.get("/services/:id", async(req,res)=>{
    const {id} = await req.params
    const result = await servicesCollection.findOne({_id : new ObjectId(id)})
    res.status(200).send(result)
})
app.patch("/services/:id", async(req,res)=>{
    const {id} = await req.params
    const result = await servicesCollection.updateOne({_id : new ObjectId(id)},{ $set: updateData (id)})
    res.status(200).send(result)
})
app.delete("/services/:id", async(req,res)=>{
    const {id} = await req.params
    const result = await servicesCollection.deleteOne({_id : new ObjectId(id)})
    res.status(200).send(result)
})


app.get("/",(req,res)=>{
    res.status(200).send({massage: "Welcome to express backend!"})
})


app.listen(PORT,()=>{
    console.log("backend running on port",PORT)
})
export default app;