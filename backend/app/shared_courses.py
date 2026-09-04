"""
Bölümler arası ortak dersler.

Aynı ders koduyla birden fazla programda okutulan dersler için referanslar
ve havuz TEK yerde toplanıyor. Linear Algebra'yı bir kez yüklemek dört bölüm
için de yetiyor; aksi halde admin aynı dosyayı dört kez yüklemek zorunda
kalır ve havuz dörde bölünüp her biri zayıf kalırdı.

Frontend'deki lib/courseCatalog.ts içindeki SHARED_COURSES ile aynı olmalı.
"""

SHARED_COURSES: set[str] = {
    "Algorithms and Programming",
    "Calculus I",
    "Calculus II",
    "Circuit Theory I",
    "Differential Equations",
    "General Chemistry I",
    "Introduction to Computer Science and Engineering",
    "Linear Algebra",
    "Physics I",
    "Physics II",
    "Technical Drawing",
}


def is_shared(course: str) -> bool:
    """Bu ders bölümler arasında paylaşılıyor mu?"""
    return course in SHARED_COURSES