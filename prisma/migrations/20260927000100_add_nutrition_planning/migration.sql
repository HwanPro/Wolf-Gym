CREATE TYPE "NutritionPlanMode" AS ENUM ('QUANTIFIED', 'PORTIONS', 'QUALITATIVE', 'HYBRID');
CREATE TYPE "NutritionGoal" AS ENUM ('FAT_LOSS', 'MAINTENANCE', 'MUSCLE_GAIN', 'PERFORMANCE', 'HEALTH_HABITS', 'CUSTOM');
CREATE TYPE "NutritionEnergyMode" AS ENUM ('CALCULATED', 'MANUAL', 'NOT_TRACKED');
CREATE TYPE "NutritionSex" AS ENUM ('FEMALE', 'MALE');
CREATE TYPE "NutritionActivityLevel" AS ENUM ('SEDENTARY', 'LOW_ACTIVE', 'ACTIVE', 'VERY_ACTIVE');
CREATE TYPE "NutritionQuantityUnit" AS ENUM ('GRAM', 'MILLILITER', 'PORTION', 'UNIT', 'CUP', 'TABLESPOON', 'TEASPOON', 'VISUAL');
CREATE TYPE "NutritionAssignmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

CREATE TABLE "nutrition_profiles" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "usesBodyWeight" BOOLEAN NOT NULL DEFAULT false,
  "birthDate" TIMESTAMP(3),
  "sexForEquation" "NutritionSex",
  "heightCm" DECIMAL(6,2),
  "currentWeightKg" DECIMAL(6,2),
  "activityLevel" "NutritionActivityLevel",
  "objective" "NutritionGoal",
  "allergies" TEXT[],
  "dietaryRestrictions" TEXT[],
  "dislikedFoods" TEXT[],
  "consentToHealthData" BOOLEAN NOT NULL DEFAULT false,
  "consentRecordedAt" TIMESTAMP(3),
  "requiresProfessionalReview" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_measurements" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "weightKg" DECIMAL(6,2),
  "waistCm" DECIMAL(6,2),
  "bodyFatPercent" DECIMAL(5,2),
  "source" TEXT NOT NULL DEFAULT 'manual',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nutrition_measurements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_foods" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "category" TEXT,
  "preparation" TEXT,
  "source" TEXT NOT NULL DEFAULT 'custom',
  "sourceCode" TEXT,
  "referenceGrams" DECIMAL(8,2) NOT NULL DEFAULT 100,
  "calories" DECIMAL(8,2),
  "proteinG" DECIMAL(8,2),
  "carbohydrateG" DECIMAL(8,2),
  "fatG" DECIMAL(8,2),
  "fiberG" DECIMAL(8,2),
  "sodiumMg" DECIMAL(10,2),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_foods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_food_portions" (
  "id" TEXT NOT NULL,
  "foodId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "grams" DECIMAL(8,2) NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "nutrition_food_portions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_plans" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "objective" "NutritionGoal" NOT NULL,
  "createdBy" TEXT NOT NULL,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_plan_versions" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "mode" "NutritionPlanMode" NOT NULL,
  "energyMode" "NutritionEnergyMode" NOT NULL,
  "targetCalories" INTEGER,
  "targetProteinG" DECIMAL(8,2),
  "targetCarbohydrateG" DECIMAL(8,2),
  "targetFatG" DECIMAL(8,2),
  "targetFiberG" DECIMAL(8,2),
  "durationWeeks" INTEGER,
  "professionalNotes" TEXT,
  "professionalName" TEXT,
  "professionalRegistration" TEXT,
  "calculationMethod" TEXT,
  "calculationSnapshot" JSONB,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "nutrition_plan_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_plan_days" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "dayIndex" INTEGER NOT NULL,
  "label" TEXT,
  "notes" TEXT,
  CONSTRAINT "nutrition_plan_days_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_meals" (
  "id" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "suggestedTime" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "instructions" TEXT,
  CONSTRAINT "nutrition_meals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_meal_items" (
  "id" TEXT NOT NULL,
  "mealId" TEXT NOT NULL,
  "foodId" TEXT,
  "name" TEXT NOT NULL,
  "quantity" DECIMAL(8,2),
  "unit" "NutritionQuantityUnit",
  "gramsEquivalent" DECIMAL(8,2),
  "displayAmount" TEXT,
  "calories" DECIMAL(8,2),
  "proteinG" DECIMAL(8,2),
  "carbohydrateG" DECIMAL(8,2),
  "fatG" DECIMAL(8,2),
  "notes" TEXT,
  "alternativeGroup" TEXT,
  "isAlternative" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "nutrition_meal_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_plan_assignments" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "status" "NutritionAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "assignedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "nutrition_plan_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "nutrition_check_ins" (
  "id" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "weightKg" DECIMAL(6,2),
  "adherencePercent" INTEGER,
  "hungerLevel" INTEGER,
  "energyLevel" INTEGER,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  CONSTRAINT "nutrition_check_ins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nutrition_profiles_userId_key" ON "nutrition_profiles"("userId");
CREATE INDEX "nutrition_measurements_profileId_measuredAt_idx" ON "nutrition_measurements"("profileId", "measuredAt");
CREATE INDEX "nutrition_foods_normalizedName_idx" ON "nutrition_foods"("normalizedName");
CREATE INDEX "nutrition_foods_source_sourceCode_idx" ON "nutrition_foods"("source", "sourceCode");
CREATE INDEX "nutrition_food_portions_foodId_idx" ON "nutrition_food_portions"("foodId");
CREATE UNIQUE INDEX "nutrition_food_portions_foodId_name_key" ON "nutrition_food_portions"("foodId", "name");
CREATE INDEX "nutrition_plans_createdBy_isArchived_idx" ON "nutrition_plans"("createdBy", "isArchived");
CREATE UNIQUE INDEX "nutrition_plan_versions_planId_version_key" ON "nutrition_plan_versions"("planId", "version");
CREATE INDEX "nutrition_plan_versions_planId_isPublished_idx" ON "nutrition_plan_versions"("planId", "isPublished");
CREATE UNIQUE INDEX "nutrition_plan_days_versionId_dayIndex_key" ON "nutrition_plan_days"("versionId", "dayIndex");
CREATE INDEX "nutrition_meals_dayId_sortOrder_idx" ON "nutrition_meals"("dayId", "sortOrder");
CREATE INDEX "nutrition_meal_items_mealId_sortOrder_idx" ON "nutrition_meal_items"("mealId", "sortOrder");
CREATE INDEX "nutrition_meal_items_foodId_idx" ON "nutrition_meal_items"("foodId");
CREATE INDEX "nutrition_plan_assignments_userId_status_startsAt_idx" ON "nutrition_plan_assignments"("userId", "status", "startsAt");
CREATE INDEX "nutrition_plan_assignments_versionId_idx" ON "nutrition_plan_assignments"("versionId");
CREATE INDEX "nutrition_check_ins_assignmentId_recordedAt_idx" ON "nutrition_check_ins"("assignmentId", "recordedAt");

ALTER TABLE "nutrition_profiles" ADD CONSTRAINT "nutrition_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_measurements" ADD CONSTRAINT "nutrition_measurements_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "nutrition_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_food_portions" ADD CONSTRAINT "nutrition_food_portions_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "nutrition_foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_plan_versions" ADD CONSTRAINT "nutrition_plan_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "nutrition_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_plan_days" ADD CONSTRAINT "nutrition_plan_days_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "nutrition_plan_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_meals" ADD CONSTRAINT "nutrition_meals_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "nutrition_plan_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_meal_items" ADD CONSTRAINT "nutrition_meal_items_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "nutrition_meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_meal_items" ADD CONSTRAINT "nutrition_meal_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "nutrition_foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "nutrition_plan_assignments" ADD CONSTRAINT "nutrition_plan_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nutrition_plan_assignments" ADD CONSTRAINT "nutrition_plan_assignments_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "nutrition_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "nutrition_check_ins" ADD CONSTRAINT "nutrition_check_ins_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "nutrition_plan_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
