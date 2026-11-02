import type { Img } from './ai';
import { unavailableReview, type ShotReview, type StoredPosePlan } from './photo-director';

type DeliveryDependencies = {
  review: (image: Img) => Promise<ShotReview>;
  save: (image: Img, plan: StoredPosePlan) => Promise<string>;
  repair: (image: Img, instruction: string) => Promise<Img>;
  canRepair: () => Promise<boolean>;
};

// Preserve the paid original before attempting a bounded repair. A failed checker or repair never loses it.
export async function deliverDirectedImage(image: Img, plan: StoredPosePlan, allowRepair: boolean, deps: DeliveryDependencies) {
  const check = async (img: Img) => {
    try { return await deps.review(img); } catch { return unavailableReview(); }
  };
  const review = await check(image);
  const originalPlan = { ...plan, review, repaired: false };
  const src = await deps.save(image, originalPlan);
  const original = { src, posePlan: originalPlan };
  if (!allowRepair || !Object.values(review.checks).includes('fail') || !review.correction) return original;
  try {
    if (!await deps.canRepair()) return original;
    const correction = review.correction + (review.checks.camera_crop === 'fail'
      ? ' For crop safety, pull the camera back substantially: keep the complete requested subject extent inside the central 70% of the uncropped image height and central 80% of its width. Fill the margins with the same location; do not crop required toes, heels, hands or head.' : '');
    const fixed = await deps.repair(image, correction);
    const fixedReview = await check(fixed);
    const fixedPlan = { ...plan, review: fixedReview, repaired: true, originalSrc: src };
    const fixedSrc = await deps.save(fixed, fixedPlan);
    // Keep both attempts in the library; only choose the repair when review evidence improves.
    const penalty = (r: ShotReview) => r.status === 'unavailable' ? Infinity
      : Object.values(r.checks).reduce((sum, value) => sum + (value === 'fail' ? 2 : value === 'uncertain' ? 1 : 0), 0);
    return penalty(fixedReview) < penalty(review) ? { src: fixedSrc, posePlan: fixedPlan } : original;
  } catch (e) {
    console.error('แก้ภาพอัตโนมัติไม่สำเร็จ เก็บภาพแรกไว้', (e as Error).message);
    return { ...original, posePlan: { ...originalPlan, repairError: 'แก้ภาพอัตโนมัติไม่สำเร็จ เก็บภาพแรกไว้ กรุณาตรวจรูปก่อนใช้งาน' } };
  }
}
