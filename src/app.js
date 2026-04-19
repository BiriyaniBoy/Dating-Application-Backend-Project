import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
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
