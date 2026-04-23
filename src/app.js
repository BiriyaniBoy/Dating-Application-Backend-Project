import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

// Simple Logger Middleware to see if requests arrive
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(cors()); // Nuclear fix: Allow everything for now

// app.use(express.json({ limit: "16kb" }));
// app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.json({ limit: "10mb" })); // Increase from 16kb to 10mb
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(express.static("public"));
app.use(cookieParser());

// Routes import
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import uploadRouter from "./routes/upload.routes.js";
import commentRouter from "./routes/comment.routes.js";
import interactionRouter from "./routes/interaction.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import { errorHandler } from "./middlewares/error.middleware.js";

// Routes declaration
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", userRouter);
app.use("/api/v1", uploadRouter);
app.use("/api/v1/comments", commentRouter);
app.use("/api/v1/interactions", interactionRouter);
app.use("/api/v1/subscriptions", subscriptionRouter);

// Common error handler
app.use(errorHandler);

export { app };
