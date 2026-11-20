import express from "express";
import cors from "cors";
import "dotenv/config";
import Stripe from "stripe";
import { MongoClient, ObjectId } from "mongodb";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const app = express();
const PORT = process.env.PORT || 5000;
app.use(express.json());
app.use(cors({ allowedHeaders: ["Content-Type", "Authorization"] }));
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
const sessionsCollection = db.collection("session");
const bookingsCollection = db.collection("Bookings");
const bookmarksCollection = db.collection("Bookmarks");
const transactionsCollection = db.collection("Transactions");

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const token = header.slice(7);
  const session = await sessionsCollection.findOne({ token });
  if (!session) return res.status(401).send({ message: "Unauthorized" });

  const user = await usersCollection.findOne({
    _id: new ObjectId(session.userId),
  });
  if (!user) return res.status(401).send({ message: "Unauthorized" });

  req.user = user;
  req.userId = String(user._id);
  req.role = user.role || "customer";
  next();
};

const canViewBooking = async (req, booking) => {
  if (req.role === "admin") return true;
  if (booking.customerId === req.userId) return true;
  if (booking.vendorId === req.userId) return true;

  const service = await servicesCollection.findOne({
    _id: new ObjectId(booking.serviceId),
    vendorId: req.userId,
  });
  return Boolean(service);
};

app.get("/", (req, res) => {
  res.send({ message: "Welcome to express backend!" });
});

// Public catalog: anyone can browse services.
app.get("/services", async (req, res) => {
  const id = req.query.id;
  if (id) {
    const result = await servicesCollection.findOne({ _id: new ObjectId(id) });
    return res.send(result);
  }

  const query = req.query.vendorId ? { vendorId: req.query.vendorId } : {};
  res.send(await servicesCollection.find(query).toArray());
});

app.post("/services", verifyToken, async (req, res) => {
  if (req.role === "customer") {
    return res.status(403).send({ message: "Forbidden" });
  }

  const newService = {
    ...req.body,
    vendorId: req.role === "admin" ? req.body.vendorId : req.userId,
  };
  res.send(await servicesCollection.insertOne(newService));
});

app.patch("/services", verifyToken, async (req, res) => {
  const id = new ObjectId(req.query.id);
  const service = await servicesCollection.findOne({ _id: id });
  if (!service) return res.status(404).send({ error: "Service not found" });
  if (req.role !== "admin" && service.vendorId !== req.userId) {
    return res.status(403).send({ message: "Forbidden" });
  }

  res.send(await servicesCollection.updateOne({ _id: id }, { $set: req.body }));
});

app.delete("/services", verifyToken, async (req, res) => {
  const id = new ObjectId(req.query.id);
  const service = await servicesCollection.findOne({ _id: id });
  if (!service) return res.status(404).send({ error: "Service not found" });
  if (req.role !== "admin" && service.vendorId !== req.userId) {
    return res.status(403).send({ message: "Forbidden" });
  }

  res.send(await servicesCollection.deleteOne({ _id: id }));
});

app.get("/users/premium", verifyToken, async (req, res) => {
  const id = req.query.id || req.userId;
  if (req.role !== "admin" && id !== req.userId) {
    return res.status(403).send({ message: "Forbidden" });
  }

  const result = await usersCollection.findOne(
    { _id: new ObjectId(id) },
    { projection: { isPremium: 1 } },
  );
  res.send(result);
});

app.get("/users", verifyToken, async (req, res) => {
  const id = req.query.id;
  if (id) {
    if (req.role !== "admin" && id !== req.userId) {
      return res.status(403).send({ message: "Forbidden" });
    }

    const result = await usersCollection.findOne({ _id: new ObjectId(id) });
    return result
      ? res.send(result)
      : res.status(404).send({ error: "User not found" });
  }

  const query = req.role === "customer" ? { _id: new ObjectId(req.userId) } : {};
  res.send(await usersCollection.find(query).toArray());
});

app.patch("/users", verifyToken, async (req, res) => {
  const id = req.query.id;
  if (req.role !== "admin" && id !== req.userId) {
    return res.status(403).send({ message: "Forbidden" });
  }

  let updateData = req.body;
  if (req.role !== "admin") {
    const { role, isBlocked, isPremium, ...rest } = req.body;
    updateData = role && role !== "admin" ? { ...rest, role } : rest;
  }

  res.send(
    await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    ),
  );
});

app.delete("/users", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }

  res.send(
    await usersCollection.deleteOne({ _id: new ObjectId(req.query.id) }),
  );
});

app.get("/bookings", verifyToken, async (req, res) => {
  const id = req.query.id;
  if (id) {
    const booking = await bookingsCollection.findOne({
      _id: new ObjectId(id),
    });
    if (!booking) return res.status(404).send({ error: "Booking not found" });
    if (!(await canViewBooking(req, booking))) {
      return res.status(403).send({ message: "Forbidden" });
    }
    return res.send(booking);
  }

  let query = {};
  if (req.role === "customer") {
    query = { customerId: req.userId };
  } else if (req.role === "vendor") {
    const services = await servicesCollection
      .find({ vendorId: req.userId })
      .toArray();
    query = {
      $or: [
        { vendorId: req.userId },
        { serviceId: { $in: services.map((service) => String(service._id)) } },
      ],
    };
  }

  res.send(await bookingsCollection.find(query).toArray());
});

app.post("/bookings", verifyToken, async (req, res) => {
  if (req.role !== "customer") {
    return res.status(403).send({ message: "Forbidden" });
  }

  const newBooking = { ...req.body, customerId: req.userId };
  res.send(await bookingsCollection.insertOne(newBooking));
});

app.patch("/bookings", verifyToken, async (req, res) => {
  const id = new ObjectId(req.query.id);
  const booking = await bookingsCollection.findOne({ _id: id });
  if (!booking) return res.status(404).send({ error: "Booking not found" });
  if (!(await canViewBooking(req, booking))) {
    return res.status(403).send({ message: "Forbidden" });
  }

  res.send(await bookingsCollection.updateOne({ _id: id }, { $set: req.body }));
});

app.delete("/bookings", verifyToken, async (req, res) => {
  const id = new ObjectId(req.query.id);
  const booking = await bookingsCollection.findOne({ _id: id });
  if (!booking) return res.status(404).send({ error: "Booking not found" });
  if (!(await canViewBooking(req, booking))) {
    return res.status(403).send({ message: "Forbidden" });
  }

  res.send(await bookingsCollection.deleteOne({ _id: id }));
});

app.get("/bookmarks", verifyToken, async (req, res) => {
  const query = { userId: req.userId };
  const id = req.query.id;
  if (id) {
    const bookmark = await bookmarksCollection.findOne({
      _id: new ObjectId(id),
      ...query,
    });
    return bookmark
      ? res.send(bookmark)
      : res.status(404).send({ error: "Bookmark not found" });
  }

  res.send(await bookmarksCollection.find(query).toArray());
});

app.post("/bookmarks", verifyToken, async (req, res) => {
  const newBookmark = { ...req.body, userId: req.userId };
  res.send(await bookmarksCollection.insertOne(newBookmark));
});

app.delete("/bookmarks", verifyToken, async (req, res) => {
  res.send(
    await bookmarksCollection.deleteOne({
      _id: new ObjectId(req.query.id),
      userId: req.userId,
    }),
  );
});

app.get("/transactions", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }

  const query = req.query.userId ? { userId: req.query.userId } : {};
  res.send(await transactionsCollection.find(query).toArray());
});

app.post("/transactions/verify", verifyToken, async (req, res) => {
  const { session_id } = req.body;
  const { status, payment_status, customer_email, metadata, payment_intent } =
    await stripe.checkout.sessions.retrieve(session_id);

  const userId = metadata?.userId || req.userId;
  if (req.role !== "admin" && userId !== req.userId) {
    return res.status(403).send({ message: "Forbidden" });
  }

  if (status === "complete" && payment_status === "paid") {
    const existing = await transactionsCollection.findOne({ session_id });
    if (existing) return res.send({ ...existing, success: true });

    const newTransaction = {
      session_id,
      status,
      payment_status,
      customer_email,
      userId,
      payment_date: new Date(),
      payment_intent,
    };
    const result = await transactionsCollection.insertOne(newTransaction);
    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { isPremium: true } },
    );
    return res.send({ ...result, success: true });
  }

  res.status(400).send({ success: false, message: "Transaction failed" });
});

app.listen(PORT, () => {
  console.log("backend running on port", PORT);
});

export default app;
