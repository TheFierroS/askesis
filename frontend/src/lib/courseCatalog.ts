/**
 * Program kataloğu — bölümler, sınıflar, dersler.
 *
 * Aydın Adnan Menderes Üniversitesi Mühendislik Fakültesi öğretim
 * programlarından (2025) üretildi. Yalnızca ZORUNLU dersler var; seçmeli
 * havuzları, staj, bitirme projesi, laboratuvar ve dil/genel kültür dersleri
 * dışarıda — bunların yazılı sınavı ya yok ya da soru üretmek anlamlı değil.
 *
 * Bu liste ARAYÜZE aittir. Backend'in kataloğu (/api/catalog) yalnızca "hangi
 * kombinasyon için referans sınav yüklenmiş" bilgisini veriyor; ikisi
 * birleşince kullanıcı programın tamamını görüyor, hazır olanlar normal,
 * olmayanlar soluk çiziliyor.
 *
 * Ders adı backend'e yüklenirken yazılan adla BİREBİR aynı olmalı.
 */

export const DEPARTMENTS: string[] = [
    "Computer Engineering",
    "Electrical and Electronics Engineering",
    "Mechanical Engineering",
    "Civil Engineering",
    "Food Engineering",
];

export const GRADES: string[] = [
    "1st Grade",
    "2nd Grade",
    "3rd Grade",
    "4th Grade",
];

export const EXAM_TYPES: string[] = ["Midterm", "Final"];

/** Tüm sınıfların derslerini birden gösteren seçenek. */
export const ALL_GRADES = "All grades";

/**
 * Ders listeleri. Anahtar: "Bölüm|Sınıf".
 * 1.-2. yarıyıl → 1. sınıf, 3.-4. → 2. sınıf, ve devamı.
 */
export const COURSES: Record<string, string[]> = {
    "Computer Engineering|1st Grade": [
        "Algorithms and Programming",
        "Calculus I",
        "Calculus II",
        "Formal Logic",
        "Introduction to Computer Science and Engineering",
        "Introduction to Graph Theory",
        "Physics I",
    ],
    "Computer Engineering|2nd Grade": [
        "Computer Networks",
        "Data Structures",
        "Database Management Systems",
        "Differential Equations",
        "Digital Circuits",
        "Electrotechnics",
        "Formal Languages and Automata Theory",
        "Linear Algebra",
        "Object Oriented Programming",
        "Statistical Programming",
        "Web Technologies and Programming",
    ],
    "Computer Engineering|3rd Grade": [
        "Computer Architecture and Organisation",
        "Human Computer Interaction",
        "Machine Learning",
        "Numerical Analysis",
        "Operating Systems",
        "Project Management and Engineering Economics",
        "Software Engineering",
        "Systems Analysis and Design",
    ],
    "Electrical and Electronics Engineering|1st Grade": [
        "Algorithms and Programming",
        "Calculus I",
        "Calculus II",
        "General Chemistry I",
        "Introduction to Computer Science and Engineering",
        "Introduction to Electricity and Safety",
        "Physics I",
        "Physics II",
        "Technical Drawing",
    ],
    "Electrical and Electronics Engineering|2nd Grade": [
        "Circuit Theory I",
        "Circuit Theory II",
        "Complex Variables",
        "Concepts of Modern Physics",
        "Differential Equations",
        "Electromagnetic Field Theory",
        "Linear Algebra",
        "Logic Design",
        "Probability and Random Variables",
        "Semiconductor Devices",
    ],
    "Electrical and Electronics Engineering|3rd Grade": [
        "Control Theory",
        "Electromagnetic Wave Theory",
        "Electromechanical Energy Conversion",
        "Electromechanical Energy Conversion I",
        "Electromechanical Energy Conversion II",
        "Electronics I",
        "Electronics II",
        "Microprocessors",
        "Signals and Systems",
        "Telecommunications I",
    ],
    "Electrical and Electronics Engineering|4th Grade": [
        "Engineering Economics",
    ],
    "Mechanical Engineering|1st Grade": [
        "Calculus I",
        "Calculus II",
        "General Chemistry I",
        "Introduction to Mechanical Engineering",
        "Physics I",
        "Physics II",
        "Statics",
        "Technical Drawing",
    ],
    "Mechanical Engineering|2nd Grade": [
        "Circuit Theory I",
        "Computer Aided Design",
        "Differential Equations",
        "Dynamics",
        "Engineering Statistics",
        "Linear Algebra",
        "Materials Science",
        "Strength of Materials",
        "Thermodynamics",
    ],
    "Mechanical Engineering|3rd Grade": [
        "Engineering Economics",
        "Fluid Mechanics",
        "Heat Transfer",
        "Manufacturing Processes",
        "Measurement Techniques",
        "Mechanical Design",
        "Mechanism Design",
        "Numerical Methods",
        "System Dynamics and Control",
    ],
    "Civil Engineering|1st Grade": [
        "Calculus I",
        "Calculus II",
        "General Chemistry I",
        "Physics I",
        "Physics II",
        "Statics",
        "Technical Drawing",
    ],
    "Civil Engineering|2nd Grade": [
        "Construction Materials",
        "Differential Equations",
        "Dynamics",
        "Fluid Mechanics",
        "Introduction to Programming in Engineering",
        "Linear Algebra",
        "Materials Science",
        "Statistics for Civil Engineering",
        "Strength of Materials",
        "Surveying",
    ],
    "Civil Engineering|3rd Grade": [
        "Engineering Economics",
        "Foundation Engineering",
        "Hydrology",
        "Hydromechanics",
        "Numerical Methods",
        "Reinforced Concrete",
        "Soil Mechanics",
        "Steel Structures",
        "Structural Analysis",
        "Transportation Engineering",
    ],
    "Civil Engineering|4th Grade": [
        "Construction Management",
        "Reinforced Concrete II",
        "Structural Dynamics",
    ],
    "Food Engineering|1st Grade": [
        "Analytical Chemistry",
        "Biology",
        "Calculus I",
        "Calculus II",
        "Computer Programming",
        "General Chemistry",
        "Information Technologies",
        "Introduction to Food Engineering",
        "Organic Chemistry",
        "Physics I",
        "Technical Drawing",
    ],
    "Food Engineering|2nd Grade": [
        "Differential Equations",
        "Fluid Mechanics",
        "Food Biochemistry",
        "Food Chemistry I",
        "Food Chemistry II",
        "Food Microbiology",
        "General Microbiology",
        "Mass and Energy Balances",
        "Reaction Kinetics",
        "Statistics and Probability",
        "Thermodynamics",
    ],
    "Food Engineering|3rd Grade": [
        "Cereal Technology",
        "Dairy Technology",
        "Food Biotechnology",
        "Food Quality Assurance",
        "Fruit and Vegetable Technology",
        "Heat and Mass Transfer",
        "Instrumental Analysis",
        "Meat Technology",
        "Oil Technology",
        "Unit Operations in Food Engineering",
    ],
    "Food Engineering|4th Grade": [
        "Engineering Economics",
        "Food Packaging",
        "Process Control",
    ],
};

/**
 * Bölümler arası ortak dersler.
 *
 * Aynı ders koduyla birden fazla programda okutulan dersler. Bunlar için
 * referans sınavlar TEK havuzda toplanıyor: Linear Algebra'yı bir kez
 * yüklemek dört bölüm için de yetiyor, aynı dosyayı dört kez yüklemeye
 * gerek yok.
 *
 * Backend'deki SHARED_COURSES ayarıyla aynı olmalı.
 */
export const SHARED_COURSES: Record<string, string[]> = {
    "Algorithms and Programming": [
        "Computer Engineering",
        "Electrical and Electronics Engineering",
    ],
    "Calculus I": [
        "Civil Engineering",
        "Computer Engineering",
        "Electrical and Electronics Engineering",
        "Food Engineering",
        "Mechanical Engineering",
    ],
    "Calculus II": [
        "Civil Engineering",
        "Computer Engineering",
        "Electrical and Electronics Engineering",
        "Food Engineering",
        "Mechanical Engineering",
    ],
    "Circuit Theory I": [
        "Electrical and Electronics Engineering",
        "Mechanical Engineering",
    ],
    "Differential Equations": [
        "Civil Engineering",
        "Computer Engineering",
        "Electrical and Electronics Engineering",
        "Food Engineering",
        "Mechanical Engineering",
    ],
    "General Chemistry I": [
        "Civil Engineering",
        "Electrical and Electronics Engineering",
        "Mechanical Engineering",
    ],
    "Introduction to Computer Science and Engineering": [
        "Computer Engineering",
        "Electrical and Electronics Engineering",
    ],
    "Linear Algebra": [
        "Civil Engineering",
        "Computer Engineering",
        "Electrical and Electronics Engineering",
        "Mechanical Engineering",
    ],
    "Physics I": [
        "Civil Engineering",
        "Computer Engineering",
        "Electrical and Electronics Engineering",
        "Food Engineering",
        "Mechanical Engineering",
    ],
    "Physics II": [
        "Civil Engineering",
        "Electrical and Electronics Engineering",
        "Mechanical Engineering",
    ],
    "Technical Drawing": [
        "Electrical and Electronics Engineering",
        "Mechanical Engineering",
    ],
};

export function isShared(course: string): boolean {
    return course in SHARED_COURSES;
}

/** Bir bölüm + sınıf için ders listesi. "All grades" tüm sınıfları birleştirir. */
export function coursesFor(department: string, grade: string): string[] {
    if (grade === ALL_GRADES) {
        const all = GRADES.flatMap((g) => COURSES[`${department}|${g}`] ?? []);
        return [...new Set(all)].sort();
    }
    return [...(COURSES[`${department}|${grade}`] ?? [])].sort();
}

export const GRADE_OPTIONS: string[] = [ALL_GRADES, ...GRADES];

/**
 * Backend kataloğundan "neyin hazır olduğu" sorgusu.
 *
 * Uygunluk DERS ADI üzerinden tutuluyor, bölümden bağımsız. Backend de
 * referansları ve havuzu ders adıyla saklıyor: Linear Algebra bir kez
 * yüklendiğinde onu okutan bütün bölümlerde hazır oluyor.
 */
export interface Availability {
    /** "Ders" */
    courses: Set<string>;
    /** "Ders|Tür" */
    exams: Set<string>;
}

export function buildAvailability(
    entries: { department: string; course: string; exam_type: string }[],
): Availability {
    const availability: Availability = {
        courses: new Set(),
        exams: new Set(),
    };

    for (const entry of entries) {
        availability.courses.add(entry.course);
        availability.exams.add(`${entry.course}|${entry.exam_type}`);
    }

    return availability;
}

/** Bu bölümde hazır olan en az bir ders var mı? */
export function departmentHasContent(
    department: string,
    availability: Availability,
): boolean {
    return coursesFor(department, ALL_GRADES).some((course) =>
        availability.courses.has(course),
    );
}