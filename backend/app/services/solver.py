"""
Çözüm üretimi.

Soru üretiminden ayrı bir modül çünkü ekonomisi farklı:
- Soru üretimi toplu ve önceden (havuz doldurulurken).
- Çözüm ise talep üzerine, tek tek. Öğrencilerin çoğu her sorunun çözümüne
  bakmıyor; hepsini önden üretmek boşa token olurdu.

Ama bir kez üretilen çözüm havuzda saklanıyor. Aynı soru başka bir öğrenciye
gittiğinde LLM'e hiç gidilmiyor. Havuz büyüdükçe çözümlerin çoğu önbellekten
geliyor.
"""

from __future__ import annotations

import logging

from app.config import get_settings
from app.prompts import QUESTION_SOLVER_PROMPT
from app.services import pool
from app.services.judge import review_solution
from app.services.llm import AllProvidersFailed, complete

logger = logging.getLogger(__name__)

# Hakem reddederse kaç kez yeniden denenecek.
# 1 deneme daha: ikinci denemede de reddedilirse elimizdekini veriyoruz,
# çünkü öğrenciyi boş ekranla bırakmak daha kötü.
MAX_RETRIES = 1


def solve(question_id: str, prompt: str, *, verify: bool = True) -> str:
    """
    Sorunun çözümünü döndürür. Önce önbelleğe bakar.

    verify=False: hakem kontrolünü atlar. Toplu çözüm üretimi gibi maliyetin
    öne çıktığı yerlerde kullanılabilir.
    """
    cached = pool.get_solution(question_id)
    if cached:
        logger.debug("Çözüm önbellekten: %s", question_id)
        return cached

    settings = get_settings()
    last: str = ""

    for attempt in range(MAX_RETRIES + 1):
        solution = complete(
            system=QUESTION_SOLVER_PROMPT,
            user=prompt,
            chain=settings.solver_chain,
            max_tokens=settings.solver_max_tokens,
            # Çözümde yaratıcılık istemiyoruz, doğruluk istiyoruz.
            temperature=0.2,
            reasoning_effort=settings.solver_reasoning,
        )
        last = solution

        if not verify:
            break

        try:
            verdict = review_solution(prompt, solution)
        except AllProvidersFailed as exc:
            # Hakem çalışmadı: çözümü denetimsiz veriyoruz. Hiç çözüm
            # olmamasından iyi, ama log'a düşüyoruz.
            logger.warning("Çözüm hakemi çalışmadı: %s", exc)
            break

        if verdict.approved:
            break

        logger.info(
            "Çözüm reddedildi (deneme %d/%d): %s",
            attempt + 1,
            MAX_RETRIES + 1,
            verdict.reason,
        )

    pool.save_solution(question_id, last)
    return last