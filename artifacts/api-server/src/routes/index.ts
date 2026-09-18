import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pubsRouter from "./pubs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pubsRouter);

export default router;
