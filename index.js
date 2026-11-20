import express from "express";
import cors from "cors";
import "dotenv/config";
import Stripe from "stripe";
import { MongoClient, ObjectId } from "mongodb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());
app.use(cors());
const DB_URI = process.env.DATABASE_URL;
const client = new MongoClient(DB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You Successfully connected to MongoDB!");
    return client;
  } catch (error) {
    console.dir(error);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("WedPlan");
const servicesCollection = db.collection("Services");
const usersCollection = db.collection("user");
const bookingsCollection = db.collection("Bookings");
const bookmarksCollection = db.collection("Bookmarks");
const transactionsCollection = db.collection("Transactions");

app.get("/users", async (req, res) => {
  const result = await usersCollection.find().toArray();
  res.status(200).send(result);
});
app.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };

  const result = await usersCollection.findOne(query);
  if (!result) {
    return res.status(404).send({ error: "User not found" });
  }
  res.send(result);
});

app.get("/users/:id/premium", async(req,res)=>{
  const {id} = req.params
  const query = {_id: new ObjectId(id)}
  const result = await usersCollection.findOne(query, {projection: {isPremium:1}})
  // if(!result){
  //   res.status(404).send({error: "User not found"})
  // }
  res.send(result)
})

app.patch("/users/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  const query = { _id: new ObjectId(id) };

  const result = await usersCollection.updateOne(query, { $set: updateData });
  res.send(result);
});
app.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  const query = { _id: new ObjectId(id) };
  const result = await usersCollection.deleteOne(query);
  res.status(200).send(result);
});

app.get("/services", async (req, res) => {
  const result = await servicesCollection.find().toArray();
  res.status(200).send(result);
});
app.get("/services/:id", async (req, res) => {
  const { id } = await req.params;
  const result = await servicesCollection.findOne({ _id: new ObjectId(id) });
  res.status(200).send(result);
});
app.patch("/services/:id", async (req, res) => {
  const { id } = await req.params;
  const updateData = req.body;
  const result = await servicesCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData },
  );
  res.status(200).send(result);
});
app.delete("/services/:id", async (req, res) => {
  const { id } = await req.params;
  const result = await servicesCollection.deleteOne({ _id: new ObjectId(id) });
  res.status(200).send(result);
});
app.post("/services", async (req, res) => {
  const newService = req.body;
  const result = await servicesCollection.insertOne(newService);
  res.status(200).send(result);
});

app.get("/bookings", async (req, res) => {
  const result = await bookingsCollection.find().toArray();
  res.status(200).send(result);
});
app.get("/bookings/:id", async (req, res) => {
  const { id } = await req.params;
  const result = await bookingsCollection.findOne({ _id: new ObjectId(id) });
  res.status(200).send(result);
});
app.post("/bookings", async (req, res) => {
  const newBooking = req.body;
  const result = await bookingsCollection.insertOne(newBooking);
  res.status(200).send(result);
});
app.patch("/bookings/:id", async (req, res) => {
  const { id } = await req.params;
  const updateData = req.body;
  const result = await bookingsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData },
  );
  res.status(200).send(result);
});
app.delete("/bookings/:id", async (req, res) => {
  const { id } = await req.params;
  const result = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
  res.status(200).send(result);
});

app.get("/bookmarks", async (req, res) => {
  const result = await bookmarksCollection.find().toArray();
  res.status(200).send(result);
});
app.post("/bookmarks", async (req, res) => {
  const newBookmark = req.body;
  const result = await bookmarksCollection.insertOne(newBookmark);
  res.status(200).send(result);
});
app.delete("/bookmarks/:id", async (req, res) => {
  const { id } = await req.params;
  const result = await bookmarksCollection.deleteOne({ _id: new ObjectId(id) });
  res.status(200).send(result);
});
app.get("/transactions", async(req,res)=>{
  const result = await transactionsCollection.find().toArray()
  res.send(result)
})
app.post("/transactions/verify", async (req, res) => {
  const { session_id } = req.body;

  const { status, payment_status, customer_email, metadata, payment_intent } =
    await stripe.checkout.sessions.retrieve(session_id);

  if (status === "complete" && payment_status === "paid") {
    const transaction = {
      session_id,
      status,
      payment_status,
      customer_email,
      userId: metadata.userId,
      payment_date: new Date(),
      payment_intent,
    };

    const existing = await transactionsCollection.findOne({ session_id });
    if (existing) return res.send({ ...existing, success: true });

    const result = await transactionsCollection.insertOne(transaction);

    const updateUser = {
      $set: { isPremium: true },
    };

    const query = {
      _id: new ObjectId(metadata.userId),
    };
    const updateResult = await usersCollection.updateOne(query, updateUser);

    res.send({ ...result, success: true });
  } else {
    res.status(400).send({ success: flase,massage: "Transaction failed" });
  }
});

app.get("/", (req, res) => {
  res.status(200).send({ massage: "Welcome to express backend!" });
});

app.listen(PORT, () => {
  console.log("backend running on port", PORT);
});
export default app;
