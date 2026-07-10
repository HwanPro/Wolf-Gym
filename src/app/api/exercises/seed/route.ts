import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/server/auth/authorization";
import prisma from "@/infrastructure/prisma/prisma";

const exercisesData = [
  // PECHO
  {
    name: "Press de banca con barra",
    slug: "press-banca-barra",
    description: "Ejercicio básico para el desarrollo del pecho, hombros y tríceps",
    instructions: "1. Acuéstate en el banco con los pies firmes en el suelo\n2. Agarra la barra con las manos separadas al ancho de los hombros\n3. Baja la barra controladamente hasta el pecho\n4. Empuja la barra hacia arriba hasta extender completamente los brazos",
    primaryMuscle: "Pecho",
    secondaryMuscles: ["Hombros", "Tríceps"],
    equipment: "Barra olímpica",
    level: "beginner",
    mechanics: "compound",
    category: "push",
    isPublished: true
  },
  {
    name: "Press con mancuernas en banco inclinado",
    slug: "press-mancuernas-inclinado",
    description: "Enfoca pecho superior y estabilizadores",
    instructions: "1. Ajusta el banco a 30-45 grados\n2. Sostén las mancuernas a los lados del pecho\n3. Empuja hacia arriba y ligeramente hacia adentro\n4. Baja controladamente hasta sentir estiramiento",
    primaryMuscle: "Pecho",
    secondaryMuscles: ["Hombros", "Tríceps"],
    equipment: "Mancuernas",
    level: "beginner",
    mechanics: "compound",
    category: "push",
    isPublished: true
  },
  {
    name: "Flexiones en suelo",
    slug: "flexiones-suelo",
    description: "Ejercicio multiarticular usando peso corporal",
    instructions: "1. Posición de plancha con manos al ancho de hombros\n2. Baja el cuerpo hasta que el pecho casi toque el suelo\n3. Empuja hacia arriba manteniendo el cuerpo recto\n4. Mantén el core activado durante todo el movimiento",
    primaryMuscle: "Pecho",
    secondaryMuscles: ["Hombros", "Tríceps", "Core"],
    equipment: "Peso corporal",
    level: "beginner",
    mechanics: "compound",
    category: "push",
    isPublished: true
  },
  {
    name: "Aperturas con mancuernas",
    slug: "aperturas-mancuernas",
    description: "Ejercicio de aislamiento para pecho",
    instructions: "1. Acuéstate en banco con mancuernas sobre el pecho\n2. Baja los brazos en arco amplio\n3. Siente el estiramiento en el pecho\n4. Regresa a la posición inicial",
    primaryMuscle: "Pecho",
    secondaryMuscles: [],
    equipment: "Mancuernas",
    level: "beginner",
    mechanics: "isolation",
    category: "push",
    isPublished: true
  },

  // ESPALDA
  {
    name: "Dominadas",
    slug: "dominadas",
    description: "Ejercicio de tracción vertical para desarrollar la espalda",
    instructions: "1. Cuélgate de la barra con agarre prono\n2. Activa el core y retrae los omóplatos\n3. Tira hacia arriba hasta que la barbilla pase la barra\n4. Baja controladamente",
    primaryMuscle: "Dorsales",
    secondaryMuscles: ["Bíceps", "Romboides", "Trapecio medio"],
    equipment: "Barra de dominadas",
    level: "intermediate",
    mechanics: "compound",
    category: "pull",
    isPublished: true
  },
  {
    name: "Peso muerto con barra",
    slug: "peso-muerto-barra",
    description: "Ejercicio fundamental para la cadena posterior",
    instructions: "1. Párate con los pies al ancho de las caderas, barra sobre los pies\n2. Flexiona las caderas y rodillas para agarrar la barra\n3. Mantén la espalda recta y el pecho arriba\n4. Levanta la barra extendiendo caderas y rodillas simultáneamente",
    primaryMuscle: "Espalda baja",
    secondaryMuscles: ["Glúteos", "Isquiotibiales", "Trapecios"],
    equipment: "Barra olímpica",
    level: "intermediate",
    mechanics: "compound",
    category: "pull",
    isPublished: true
  },
  {
    name: "Remo con barra",
    slug: "remo-barra",
    description: "Ejercicio de tracción horizontal para espalda media",
    instructions: "1. Inclínate hacia adelante con la barra en las manos\n2. Mantén la espalda recta y el core activado\n3. Tira la barra hacia el abdomen bajo\n4. Baja controladamente",
    primaryMuscle: "Dorsales",
    secondaryMuscles: ["Romboides", "Trapecio medio", "Bíceps"],
    equipment: "Barra olímpica",
    level: "beginner",
    mechanics: "compound",
    category: "pull",
    isPublished: true
  },
  {
    name: "Jalones frontales",
    slug: "jalones-frontales",
    description: "Sustituto de dominadas, ejercicio de tracción vertical",
    instructions: "1. Siéntate en la máquina con las rodillas fijas\n2. Agarra la barra con las manos más anchas que los hombros\n3. Tira hacia abajo hasta el pecho\n4. Controla la subida",
    primaryMuscle: "Dorsales",
    secondaryMuscles: ["Bíceps", "Romboides"],
    equipment: "Máquina",
    level: "beginner",
    mechanics: "compound",
    category: "pull",
    isPublished: true
  },

  // PIERNAS
  {
    name: "Sentadilla con barra",
    slug: "sentadilla-barra",
    description: "El rey de los ejercicios de piernas",
    instructions: "1. Coloca la barra en la parte superior de la espalda\n2. Pies separados al ancho de los hombros\n3. Baja flexionando caderas y rodillas\n4. Sube empujando con los talones",
    primaryMuscle: "Cuádriceps",
    secondaryMuscles: ["Glúteos", "Isquiotibiales", "Core"],
    equipment: "Barra olímpica",
    level: "beginner",
    mechanics: "compound",
    category: "legs",
    isPublished: true
  },
  {
    name: "Prensa inclinada",
    slug: "prensa-inclinada",
    description: "Alternativa más segura a la sentadilla",
    instructions: "1. Siéntate en la máquina con espalda apoyada\n2. Coloca pies en la plataforma\n3. Baja controladamente\n4. Empuja hacia arriba sin bloquear rodillas",
    primaryMuscle: "Cuádriceps",
    secondaryMuscles: ["Glúteos"],
    equipment: "Máquina",
    level: "beginner",
    mechanics: "compound",
    category: "legs",
    isPublished: true
  },
  {
    name: "Peso muerto rumano",
    slug: "peso-muerto-rumano",
    description: "Enfoque en isquiotibiales y glúteos",
    instructions: "1. Sostén barra con agarre prono\n2. Mantén piernas ligeramente flexionadas\n3. Baja la barra deslizándola por las piernas\n4. Sube empujando caderas hacia adelante",
    primaryMuscle: "Isquiotibiales",
    secondaryMuscles: ["Glúteos", "Espalda baja"],
    equipment: "Barra olímpica",
    level: "intermediate",
    mechanics: "compound",
    category: "legs",
    isPublished: true
  },
  {
    name: "Hip thrust con barra",
    slug: "hip-thrust-barra",
    description: "Ejercicio específico para glúteos",
    instructions: "1. Siéntate con espalda apoyada en banco\n2. Coloca barra sobre caderas\n3. Empuja caderas hacia arriba\n4. Aprieta glúteos en la parte superior",
    primaryMuscle: "Glúteos",
    secondaryMuscles: ["Isquiotibiales"],
    equipment: "Barra olímpica",
    level: "beginner",
    mechanics: "isolation",
    category: "legs",
    isPublished: true
  },
  {
    name: "Zancadas",
    slug: "zancadas",
    description: "Ejercicio unilateral para piernas completas",
    instructions: "1. Da un paso largo hacia adelante\n2. Baja hasta que ambas rodillas estén a 90°\n3. Empuja con el talón delantero para volver\n4. Alterna piernas",
    primaryMuscle: "Cuádriceps",
    secondaryMuscles: ["Glúteos", "Isquiotibiales"],
    equipment: "Peso corporal",
    level: "beginner",
    mechanics: "compound",
    category: "legs",
    isPublished: true
  },

  // HOMBROS
  {
    name: "Press militar con barra",
    slug: "press-militar-barra",
    description: "Ejercicio de empuje vertical para desarrollar hombros",
    instructions: "1. Párate con los pies al ancho de las caderas\n2. Sostén la barra a la altura de los hombros\n3. Empuja la barra directamente hacia arriba\n4. Baja controladamente",
    primaryMuscle: "Hombros",
    secondaryMuscles: ["Tríceps", "Core"],
    equipment: "Barra olímpica",
    level: "intermediate",
    mechanics: "compound",
    category: "push",
    isPublished: true
  },
  {
    name: "Press con mancuernas sentado",
    slug: "press-mancuernas-sentado",
    description: "Desarrollo completo de hombros con estabilización",
    instructions: "1. Siéntate en banco con respaldo\n2. Sostén mancuernas a la altura de los hombros\n3. Empuja hacia arriba hasta extender brazos\n4. Baja controladamente",
    primaryMuscle: "Hombros",
    secondaryMuscles: ["Tríceps"],
    equipment: "Mancuernas",
    level: "beginner",
    mechanics: "compound",
    category: "push",
    isPublished: true
  },
  {
    name: "Elevaciones laterales",
    slug: "elevaciones-laterales",
    description: "Aislamiento para deltoides lateral",
    instructions: "1. Párate con mancuernas a los lados\n2. Eleva los brazos hacia los lados hasta la altura de hombros\n3. Mantén ligera flexión en codos\n4. Baja controladamente",
    primaryMuscle: "Hombros",
    secondaryMuscles: [],
    equipment: "Mancuernas",
    level: "beginner",
    mechanics: "isolation",
    category: "push",
    isPublished: true
  },

  // BRAZOS
  {
    name: "Curl con barra Z",
    slug: "curl-barra-z",
    description: "Ejercicio básico para desarrollo de bíceps",
    instructions: "1. Párate con barra Z en las manos\n2. Mantén codos fijos a los lados\n3. Flexiona llevando la barra hacia arriba\n4. Baja controladamente",
    primaryMuscle: "Bíceps",
    secondaryMuscles: ["Antebrazos"],
    equipment: "Barra Z",
    level: "beginner",
    mechanics: "isolation",
    category: "upper",
    isPublished: true
  },
  {
    name: "Extensiones de tríceps en polea",
    slug: "extensiones-triceps-polea",
    description: "Aislamiento de tríceps con tensión constante",
    instructions: "1. Párate frente a polea alta\n2. Mantén codos fijos a los lados\n3. Extiende antebrazos hacia abajo\n4. Controla la subida",
    primaryMuscle: "Tríceps",
    secondaryMuscles: [],
    equipment: "Polea alta",
    level: "beginner",
    mechanics: "isolation",
    category: "upper",
    isPublished: true
  },
  {
    name: "Fondos en paralelas",
    slug: "fondos-paralelas",
    description: "Ejercicio compuesto para tríceps y pecho",
    instructions: "1. Sujétate en barras paralelas\n2. Baja el cuerpo flexionando brazos\n3. Empuja hacia arriba hasta extensión completa\n4. Mantén torso ligeramente inclinado",
    primaryMuscle: "Tríceps",
    secondaryMuscles: ["Pecho", "Hombros"],
    equipment: "Barras paralelas",
    level: "intermediate",
    mechanics: "compound",
    category: "push",
    isPublished: true
  },

  // CORE
  {
    name: "Plancha abdominal",
    slug: "plancha-abdominal",
    description: "Ejercicio isométrico para core completo",
    instructions: "1. Posición de flexión con antebrazos en suelo\n2. Mantén cuerpo en línea recta\n3. Activa core y glúteos\n4. Respira normalmente",
    primaryMuscle: "Core",
    secondaryMuscles: ["Hombros", "Glúteos"],
    equipment: "Peso corporal",
    level: "beginner",
    mechanics: "isolation",
    category: "core",
    isPublished: true
  },
  {
    name: "Elevaciones de piernas colgado",
    slug: "elevaciones-piernas-colgado",
    description: "Ejercicio avanzado para abdomen inferior",
    instructions: "1. Cuélgate de barra con brazos extendidos\n2. Eleva piernas hasta formar 90° con torso\n3. Baja controladamente\n4. Evita balancearte",
    primaryMuscle: "Core",
    secondaryMuscles: ["Antebrazos"],
    equipment: "Barra de dominadas",
    level: "advanced",
    mechanics: "isolation",
    category: "core",
    isPublished: true
  }
];

export async function POST(req: NextRequest) {
  const authorization = await requireAdmin(req);
  if (!authorization.authorized) return authorization.response;

  try {
    console.log('🌱 Iniciando seed de ejercicios...');

    let created = 0;
    let skipped = 0;

    for (const exerciseData of exercisesData) {
      try {
        const existing = await prisma.exercise.findUnique({
          where: { slug: exerciseData.slug }
        });

        if (!existing) {
          await prisma.exercise.create({
            data: exerciseData
          });
          created++;
          console.log(`✅ Creado: ${exerciseData.name}`);
        } else {
          skipped++;
          console.log(`⏭️ Ya existe: ${exerciseData.name}`);
        }
      } catch (error) {
        console.error(`❌ Error con ${exerciseData.name}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Seed completado: ${created} creados, ${skipped} omitidos`,
      created,
      skipped,
      total: exercisesData.length
    });

  } catch (error) {
    console.error('❌ Error en seed:', error);
    return NextResponse.json(
      { 
        success: false,
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
