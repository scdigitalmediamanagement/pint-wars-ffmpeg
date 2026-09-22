import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pubsRouter from "./pubs";
import pintProofsRouter from "./pint-proofs";
import accountDeletionRouter from "./account-deletion";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pubsRouter);
router.use(pintProofsRouter);
router.use(accountDeletionRouter);

export default router;
