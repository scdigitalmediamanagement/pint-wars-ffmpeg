import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pubsRouter from "./pubs";
import pintProofsRouter from "./pint-proofs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pubsRouter);
router.use(pintProofsRouter);

export default router;
