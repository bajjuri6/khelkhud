import { Router } from "express";
import { requestValidationSchema } from "@khelkhud/shared";
import type { RequestValidationInput } from "@khelkhud/shared";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import {
  coordinatorQueue,
  decideRequest,
  requireCoordinator,
} from "../services/coordinator.service.js";

export const coordinatorsRouter: Router = Router();

// ADMIN is allowed through so an admin can see and unblock a coordinator's queue without
// a second implementation. Scope still applies: an admin who is not also a coordinator has
// no CoordinatorProfile, so requireCoordinator rejects them. Admin override lives on the
// admin router, deliberately, rather than being smuggled in here.
coordinatorsRouter.use(requireAuth, requireRole("COORDINATOR", "ADMIN"));

/** Who am I, and which villages do I cover. */
coordinatorsRouter.get("/me", async (req, res, next) => {
  try {
    const profile = await requireCoordinator(req.user!.uid);
    res.json({
      data: {
        id: profile.id,
        designation: profile.designation,
        phone: profile.phone,
        isActive: profile.isActive,
        villages: profile.villages,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Requests waiting on me, plus what I have recently decided. */
coordinatorsRouter.get("/me/queue", async (req, res, next) => {
  try {
    const { profile, pending, recent } = await coordinatorQueue(req.user!.uid);
    res.json({
      data: { pending, recent },
      meta: {
        villages: profile.villages,
        pendingCount: pending.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Approve or reject. Approval opens the request to sponsors immediately — there is no
 * admin step, which is the whole reason the role exists.
 */
coordinatorsRouter.post(
  "/requests/:id/decide",
  validate(requestValidationSchema),
  async (req, res, next) => {
    try {
      const { decision, note } = req.body as RequestValidationInput;
      const updated = await decideRequest({
        coordinatorUserId: req.user!.uid,
        requestId: String(req.params.id),
        decision,
        note,
      });
      res.json({ data: { id: updated.id, status: updated.status } });
    } catch (err) {
      next(err);
    }
  },
);
