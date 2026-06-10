import { Router, type IRouter } from "express";
import healthRouter from "./health";
import platega from "./platega-webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use(platega);

export default router;
