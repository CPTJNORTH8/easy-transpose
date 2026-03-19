import express, { type Express } from "express";
import cors from "cors";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} query=${JSON.stringify(req.query)}`);
  next();
});

// Mount at /api for dev (Replit dev proxy passes full path)
// Mount at / for production (Replit autoscale proxy strips the /api prefix)
app.use("/api", router);
app.use("/", router);

export default app;
