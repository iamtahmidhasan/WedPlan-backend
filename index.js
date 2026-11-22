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
const categoriesCollection = db.collection("Categories");
const reviewsCollection = db.collection("reviews");

const defaultCategories = [
  {
    name: "Photography & Videography",
    description: "Candid emotional portraits, drone visuals & cinematic wedding films.",
    image: "https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=800&q=80",
    icon: "Camera",
  },
  {
    name: "Wedding Venues",
    description: "Historic estates, rustic barns, seaside villas & luxury ballrooms.",
    image: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80",
    icon: "Home",
  },
  {
    name: "Decoration & Florist",
    description: "Bespoke floral arches, candlelit tablescapes & ambient installations.",
    image: "https://images.unsplash.com/photo-1526047932273-341f2a7631f9?auto=format&fit=crop&w=800&q=80",
    icon: "Flower2",
  },
  {
    name: "Catering Services",
    description: "Artisanal multi-course dining, custom cocktails & wedding bakeries.",
    image: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=800&q=80",
    icon: "Utensils",
  },
  {
    name: "Makeup & Styling",
    description: "Bridal hair artistry, luminous glam & wedding morning wellness.",
    image: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=800&q=80",
    icon: "Sparkles",
  },
  {
    name: "Wedding Fashion",
    description: "Couture gowns, modern tailored suits, veil designs & bridal jewelry.",
    image: "https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&w=800&q=80",
    icon: "Shirt",
  },
];

async function initCategories() {
  try {
    // 1. Seed initial categories if not exists
    for (const cat of defaultCategories) {
      const escaped = cat.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const exists = await categoriesCollection.findOne({
        name: { $regex: `^${escaped}$`, $options: "i" },
      });
      if (!exists) {
        await categoriesCollection.insertOne({
          ...cat,
          createdAt: new Date(),
        });
      }
    }

    // 2. Preserve any existing categories already stored in Services
    const serviceCategories = await servicesCollection.distinct("category");
    for (const catName of serviceCategories) {
      if (catName && typeof catName === "string" && catName.trim()) {
        const trimmed = catName.trim();
        const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const exists = await categoriesCollection.findOne({
          name: { $regex: `^${escaped}$`, $options: "i" },
        });
        if (!exists) {
          await categoriesCollection.insertOne({
            name: trimmed,
            description: `${trimmed} services`,
            image: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80",
            icon: "Sparkles",
            createdAt: new Date(),
          });
        }
      }
    }

    // 3. Add categoryId to any service that currently lacks it
    const allCategories = await categoriesCollection.find({}).toArray();
    for (const cat of allCategories) {
      const escaped = cat.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      await servicesCollection.updateMany(
        {
          categoryId: { $exists: false },
          category: { $regex: `^${escaped}$`, $options: "i" },
        },
        {
          $set: { categoryId: String(cat._id) },
        }
      );
    }
  } catch (err) {
    console.error("Categories initialization error:", err);
  }
}

await initCategories();

const verifyToken = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const token = header.split(" ")[1];
  const session = await sessionsCollection.findOne({ token });
  if (
    !session ||
    !session.expiresAt ||
    new Date(session.expiresAt) <= new Date()
  ) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const user = await usersCollection.findOne({
    _id: new ObjectId(session.userId),
  });
  if (!user) return res.status(401).send({ message: "Unauthorized" });
  if (user.isBlocked) {
    return res.status(403).send({ message: "Account blocked" });
  }

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

// Public catalog: anyone can browse services with search, category, location, and sort params.
app.get("/services", async (req, res) => {
  const id = req.query.id;
  if (id) {
    const result = await servicesCollection.findOne({ _id: new ObjectId(id) });
    return res.send(result);
  }

  const query = {};
  if (req.query.vendorId) {
    query.vendorId = req.query.vendorId;
  }
  if (req.query.status) {
    query.status = req.query.status;
  }
  if (req.query.search && req.query.search.trim()) {
    const escapedSearch = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.serviceName = { $regex: escapedSearch, $options: "i" };
  }
  if (req.query.categoryId) {
    query.categoryId = req.query.categoryId;
  }
  if (req.query.category && req.query.category !== "all") {
    const escapedCat = req.query.category.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { category: { $regex: escapedCat, $options: "i" } },
      { categoryId: req.query.category },
    ];
  }
  if (req.query.location && req.query.location !== "all") {
    const escapedLoc = req.query.location.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.location = { $regex: escapedLoc, $options: "i" };
  }

  let sortOption = {};
  const sort = req.query.sort;
  if (sort === "lowest_price" || sort === "price_asc" || sort === "asc") {
    sortOption = { price: 1 };
  } else if (sort === "highest_price" || sort === "price_desc" || sort === "desc") {
    sortOption = { price: -1 };
  }

  const services = await servicesCollection.find(query).sort(sortOption).toArray();
  res.send(services);
});

app.post("/services", verifyToken, async (req, res) => {
  if (req.role === "customer") {
    return res.status(403).send({ message: "Forbidden" });
  }

  let categoryId = req.body.categoryId;
  let categoryName = req.body.category;

  if (categoryId && ObjectId.isValid(categoryId)) {
    const catDoc = await categoriesCollection.findOne({ _id: new ObjectId(categoryId) });
    if (catDoc) {
      categoryName = catDoc.name;
    }
  } else if (categoryName) {
    const catDoc = await categoriesCollection.findOne({
      name: { $regex: `^${categoryName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (catDoc) {
      categoryId = String(catDoc._id);
      categoryName = catDoc.name;
    }
  }

  const newService = {
    ...req.body,
    category: categoryName || req.body.category,
    categoryId: categoryId || req.body.categoryId,
    status: req.role === "admin" ? (req.body.status || "approved") : "pending",
    vendorId: req.role === "admin" ? req.body.vendorId : req.userId,
    createdAt: new Date(),
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

  const updates = { ...req.body };
  if (updates.categoryId && ObjectId.isValid(updates.categoryId)) {
    const catDoc = await categoriesCollection.findOne({ _id: new ObjectId(updates.categoryId) });
    if (catDoc) {
      updates.category = catDoc.name;
      updates.categoryId = String(catDoc._id);
    }
  } else if (updates.category) {
    const catDoc = await categoriesCollection.findOne({
      name: { $regex: `^${updates.category.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" },
    });
    if (catDoc) {
      updates.categoryId = String(catDoc._id);
      updates.category = catDoc.name;
    }
  }

  res.send(await servicesCollection.updateOne({ _id: id }, { $set: updates }));
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

  let query = {};
  if (req.role === "customer") {
    query = { _id: new ObjectId(req.userId) };
  } else if (req.role === "vendor") {
    const services = await servicesCollection
      .find({ vendorId: req.userId })
      .toArray();
    const bookings = await bookingsCollection
      .find({
        $or: [
          { vendorId: req.userId },
          { serviceId: { $in: services.map((service) => String(service._id)) } },
        ],
      })
      .toArray();

    const userIds = new Set([req.userId]);
    for (const booking of bookings) {
      if (booking.customerId) userIds.add(booking.customerId);
      if (booking.vendorId) userIds.add(booking.vendorId);
    }
    const ids = [...userIds]
      .filter((id) => /^[a-f\d]{24}$/i.test(id))
      .map((id) => new ObjectId(id));
    query = { _id: { $in: ids } };
  }

  res.send(await usersCollection.find(query).toArray());
});

app.patch("/users", verifyToken, async (req, res) => {
  const id = req.query.id;
  if (req.role !== "admin" && id !== req.userId) {
    return res.status(403).send({ message: "Forbidden" });
  }

  let updateData = req.body;
  if (req.role !== "admin") {
    const { role, isBlocked, isPremium, emailVerified, email, ...rest } =
      req.body;
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

  const currentStatus = (booking.status || "pending").toLowerCase();

  let updateData = req.body;
  if (req.role === "customer") {
    if (req.body.status === "cancelled" && currentStatus !== "pending") {
      return res.status(400).send({ message: "Only pending booking requests can be cancelled" });
    }
    if (req.body.status && !["pending", "cancelled"].includes(req.body.status)) {
      return res.status(403).send({ message: "Forbidden" });
    }
  }
  if (req.role === "vendor") {
    if (req.body.status === "completed") {
      if (currentStatus !== "accepted") {
        return res.status(400).send({ message: "Only accepted bookings can be marked as completed" });
      }
    } else {
      if (currentStatus !== "pending") {
        return res.status(400).send({ message: "Only pending requests can be accepted or rejected" });
      }
      if (req.body.status && !["accepted", "rejected", "completed"].includes(req.body.status)) {
        return res.status(403).send({ message: "Forbidden" });
      }
    }
  }
  if (req.role !== "admin") {
    const keys =
      req.role === "customer"
        ? ["eventDate", "eventLocation", "message", "status"]
        : ["status"];
    updateData = Object.fromEntries(
      keys.filter((key) => key in req.body).map((key) => [key, req.body[key]]),
    );
  }

  res.send(
    await bookingsCollection.updateOne({ _id: id }, { $set: updateData }),
  );
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
      plan: "Lifetime Premium",
      amount: 20,
      currency: "USD",
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

app.get("/vendors", async(req,res)=>{
  const query = {role: "vendor"};

  const vendors = await usersCollection.find(query).toArray();
  
  res.send(vendors);
})
app.get("/vendors/:id", verifyToken, async (req, res) => {
  const query = { role: "vendor" };
  const id = req.params.id;
  if (id) {
    if (!ObjectId.isValid(id)) {
      return res.status(404).send({ message: "Vendor not found" });
    }
    query._id = new ObjectId(id);
  }

  const vendor = await usersCollection.findOne(query);
  if (!vendor) {
    return res.status(404).send({ message: "Vendor not found" });
  }

  res.send(vendor);
});

app.get("/categories", async (req, res) => {
  try {
    const categories = await categoriesCollection.find({}).sort({ name: 1 }).toArray();
    res.send(categories);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch categories", error });
  }
});

app.post("/categories", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: Admin access required" });
  }

  const { name, description, image, icon } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).send({ message: "Category name is required" });
  }

  const trimmedName = name.trim();
  const escaped = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = await categoriesCollection.findOne({
    name: { $regex: `^${escaped}$`, $options: "i" },
  });
  if (existing) {
    return res.status(409).send({ message: "Category already exists" });
  }

  const newCategory = {
    name: trimmedName,
    description: description?.trim() || "",
    image: image?.trim() || "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80",
    icon: icon?.trim() || "Sparkles",
    createdAt: new Date(),
  };
  const result = await categoriesCollection.insertOne(newCategory);
  res.status(201).send({ ...newCategory, _id: result.insertedId });
});

app.patch("/categories/:id", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: Admin access required" });
  }

  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }

  const { name, description, image, icon } = req.body;
  const updates = {};
  if (name && typeof name === "string" && name.trim()) {
    updates.name = name.trim();
  }
  if (description !== undefined) updates.description = description.trim();
  if (image !== undefined) updates.image = image.trim();
  if (icon !== undefined) updates.icon = icon.trim();
  updates.updatedAt = new Date();

  await categoriesCollection.updateOne({ _id: new ObjectId(id) }, { $set: updates });

  if (updates.name) {
    await servicesCollection.updateMany(
      { categoryId: id },
      { $set: { category: updates.name } }
    );
  }

  res.send({ message: "Category updated successfully" });
});

app.delete("/categories/:id", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: Admin access required" });
  }

  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid category ID" });
  }

  const count = await servicesCollection.countDocuments({ categoryId: id });
  if (count > 0) {
    return res.status(400).send({
      message: `Cannot delete category: ${count} service(s) are currently assigned to it.`,
    });
  }

  await categoriesCollection.deleteOne({ _id: new ObjectId(id) });
  res.send({ message: "Category deleted successfully" });
});

app.get("/reviews", async(req,res) =>{

  const reviews = await reviewsCollection.find({}).toArray();
  res.send(reviews);
})
app.get("/reviews/:serviceId", async(req,res) =>{
  const id = req.params.serviceId;
  const query = {serviceId: id};
  const review = await reviewsCollection.find(query).toArray();
  res.send(review);
})
app.delete("/reviews/:id", verifyToken, async (req, res) => {
  if (req.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: Only admins can delete reviews" });
  }
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await reviewsCollection.deleteOne(query);
  res.send(result);
});

app.put("/reviews/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: "Invalid review ID" });
  }
  const { rating, review } = req.body;
  const query = { _id: new ObjectId(id) };
  const existingReview = await reviewsCollection.findOne(query);
  if (!existingReview) {
    return res.status(404).send({ message: "Review not found" });
  }
  if (existingReview.user !== req.user?.email && req.role !== "admin") {
    return res.status(403).send({ message: "Forbidden: You can only edit your own reviews" });
  }
  const updateDoc = {
    $set: {
      rating: Number(rating) || 5,
      review: String(review || "").trim(),
      date: new Date(),
    },
  };
  const result = await reviewsCollection.updateOne(query, updateDoc);
  res.send(result);
});

app.post("/reviews", verifyToken, async (req, res) => {
  const { serviceId, rating, review } = req.body;
  const userEmail = req.user?.email || "Anonymous";

  // Check if review already exists for this service and user
  const existing = await reviewsCollection.findOne({ serviceId, user: userEmail });
  if (existing) {
    const result = await reviewsCollection.updateOne(
      { _id: existing._id },
      {
        $set: {
          rating: Number(rating) || 5,
          review: String(review || "").trim(),
          date: new Date(),
        },
      }
    );
    return res.send(result);
  }

  const newReview = {
    serviceId,
    rating: Number(rating) || 5,
    review: String(review || "").trim(),
    user: userEmail,
    userName: req.user?.name || req.user?.email || "Customer",
    date: new Date(),
  };
  const result = await reviewsCollection.insertOne(newReview);
  res.send(result);
});

app.post(['/ai-chat', '/api/ai-chat'], async (req, res) => {
  const { userMessage } = req.body;

  const services = await servicesCollection.find(
    { $or: [{ status: 'approved' }, { status: { $exists: false } }] },
    { projection: { serviceName: 1, category: 1, price: 1, location: 1, description: 1, images: 1, _id: 1 } }
  ).limit(30).toArray();

  const systemPrompt = `
    You are WedPlan's helpful AI Wedding Assistant. 
    Below is the list of available wedding services in JSON format:
    ${JSON.stringify(services)}

    Rules:
    - Answer the user's query warmly, concisely, and helpfully.
    - When recommending services, write a friendly intro and include the service link tags (e.g. /services/[_id]).
    - Do NOT write plain-text details like "Price: $...", "Location: ...", or "Link: /services/..." because our UI automatically renders rich interactive service cards with photos, prices, locations, and booking buttons for each service link!
    - If no services match, politely inform the user.
    - Keep responses concise and natural.
  `;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat", 
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    })
  });

  const data = await response.json();
  res.json({ reply: data.choices?.[0]?.message?.content, services });
});

app.listen(PORT, () => {
  console.log("backend running on port", PORT);
});

export default app;
