from dataclasses import dataclass


@dataclass
class PRF:
    tp: int
    fp: int
    fn: int
    tn: int

    @property
    def precision(self) -> float:
        denom = self.tp + self.fp
        return self.tp / denom if denom else 0.0

    @property
    def recall(self) -> float:
        denom = self.tp + self.fn
        return self.tp / denom if denom else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0

    @property
    def accuracy(self) -> float:
        total = self.tp + self.fp + self.fn + self.tn
        return (self.tp + self.tn) / total if total else 0.0

    def summary(self) -> str:
        return (
            f"precision={self.precision:.2f} recall={self.recall:.2f} "
            f"f1={self.f1:.2f} acc={self.accuracy:.2f} "
            f"(tp={self.tp} fp={self.fp} fn={self.fn} tn={self.tn})"
        )


def score(pred_true: list[bool], gold_true: list[bool]) -> PRF:
    tp = fp = fn = tn = 0
    for pred, gold in zip(pred_true, gold_true):
        if pred and gold:
            tp += 1
        elif pred and not gold:
            fp += 1
        elif not pred and gold:
            fn += 1
        else:
            tn += 1
    return PRF(tp=tp, fp=fp, fn=fn, tn=tn)
