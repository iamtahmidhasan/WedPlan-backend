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






app.listen(PORT,()=>{
    console.log("backend running on port",PORT)
})
export default app;