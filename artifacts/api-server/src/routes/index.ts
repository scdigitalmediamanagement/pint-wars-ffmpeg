import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pubsRouter from "./pubs";
import pintProofsRouter from "./pint-proofs";
import leagueActivityRouter from "./league-activity";
import accountDeletionRouter from "./account-deletion";
import paidLeaguesRouter from "./paid-leagues";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pubsRouter);
router.use(pintProofsRouter);
router.use(leagueActivityRouter);
router.use(accountDeletionRouter);
router.use(paidLeaguesRouter);

export default router;
