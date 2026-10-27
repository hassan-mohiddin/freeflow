// Agreement between raters: Cohen's kappa for two raters, Krippendorff's alpha for more, and linear-weighted kappa
// for two raters on an ordered numeric scale (0-2). The statistics live in Research Work's shared library; this file
// keeps the names the evaluator imports.

export {
  cohenKappa,
  krippendorffAlpha,
  linearWeightedKappa,
  raterAgreement,
} from "../../../research-work/scripts/lib/stats.mjs";
