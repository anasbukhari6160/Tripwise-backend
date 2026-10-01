import express from "express";

import { chatWithAi } from "../controllers/ai.controller.js";

const router = express.Router();

router.post("/chat", chatWithAi);

export default router;
