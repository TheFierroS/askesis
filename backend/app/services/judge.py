"""
Hakem katmanı.

project10.py'deki denemenin üretime uygun hali. İki fark var:

1. Toplu çalışıyor. Orada her metin için ayrı çağrı vardı; burada 5 soru tek
   istekte denetleniyor. Groq'un dakikalık istek limiti düşünüldüğünde bu beş
   kat fark demek.

2. Farklı model ailesi. Üreten model kendi hatasını zor görür — aynı yanılgıyı
   iki kez tekrarlar. judge_chain bilerek gpt-oss ile başlıyor, generation_chain
   ise qwen ile.

Hakem havuz mimarisinde kullanıcıyı bekletmiyor: üretim arka planda olduğu için
denetim de arka planda. Kullanıcı yalnızca onaylanmış soruları görüyor.
"""

from __future__ import annotations

import logging

from app.config import get_settings
from app.prompts import JUDGE_PROMPT, SOLUTION_JUDGE_PROMPT
from app.schemas import (
    GeneratedQuestion,
    JudgeResult,
    QuestionVerdict,
    SolutionVerdict,
)
from app.services.llm import complete_json

logger = logging.getLogger(__name__)


def _format_questions(questions: list[GeneratedQuestion]) -> str:
    """
    Soruları indeksli bir listeye çevirir.

    İndeks önemli: hakem kararlarını index ile eşleştiriyoruz, sıraya
    güvenmiyoruz. Model bazen sırayı karıştırıp 0,2,1 döndürüyor.
    """
    blocks = []
    for i, question in enumerate(questions):
        blocks.append(f"[index {i}]\n{question.prompt}")
    return "\n\n".join(blocks)


def review_questions(questions: list[GeneratedQuestion]) -> list[QuestionVerdict]:
    """
    Soru listesini tek istekte denetler.

    AllProvidersFailed fırlatabilir; çağıran taraf buna karar vermeli
    (generator.generate_reviewed hatayı yutup denetimsiz geçiyor).
    """
    if not questions:
        return []

    settings = get_settings()

    result: JudgeResult = complete_json(
        system=JUDGE_PROMPT,
        user=(
            f"Review the following {len(questions)} questions.\n\n"
            + _format_questions(questions)
        ),
        chain=settings.judge_chain,
        schema=JudgeResult,
        max_tokens=settings.judge_max_tokens,
        # Denetimde yaratıcılık istemiyoruz: aynı soru aynı kararı almalı.
        temperature=0.0,
        reasoning_effort=settings.judge_reasoning,
    )

    verdicts = result.verdicts
    approved = sum(1 for v in verdicts if v.approved)
    logger.info("Hakem: %d/%d onay", approved, len(verdicts))

    return verdicts


def review_solution(question: str, solution: str) -> SolutionVerdict:
    """
    Tek bir çözümü denetler.

    Bu tek tek çalışıyor çünkü çözümler uzun; beşini birleştirmek çıktı token
    sınırını aşıyor ve model son çözümleri yarıda kesiyor.
    """
    settings = get_settings()

    return complete_json(
        system=SOLUTION_JUDGE_PROMPT,
        user=f"[QUESTION]\n{question}\n\n[SOLUTION]\n{solution}",
        chain=settings.judge_chain,
        schema=SolutionVerdict,
        max_tokens=settings.judge_max_tokens,
        temperature=0.0,
        reasoning_effort=settings.judge_reasoning,
    )