"use client";

import { useState } from "react";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/ui/select";

interface NutritionTabProps {
    gender: "male" | "female";
  }
  

export default function NutritionTab({ gender }: NutritionTabProps) {
  const [weight, setWeight] = useState<number>(70);
  const [height, setHeight] = useState<number>(170);
  const [age, setAge] = useState<number>(25);
  const [goal, setGoal] = useState<"loss" | "maintenance" | "gain">(
    "maintenance"
  );
  const [calories, setCalories] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fats, setFats] = useState<number | null>(null);

  const calculateCalories = (
    weight: number,
    height: number,
    age: number,
    gender: "male" | "female",
    goal: "loss" | "maintenance" | "gain"
  ) => {
    // Harris-Benedict Formula
    const bmr =
      gender === "male"
        ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
        : 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age;

    // Activity factor (moderate exercise 3-5 days/week)
    const tdee = bmr * 1.55;

    // Adjust based on goal
    switch (goal) {
      case "loss":
        return tdee - 500;
      case "gain":
        return tdee + 500;
      default:
        return tdee;
    }
  };

  const handleCalculate = () => {
    const resultCalories = calculateCalories(weight, height, age, gender, goal);
    setCalories(resultCalories);
    setProtein(Math.round((resultCalories * 0.25) / 4));
    setCarbs(Math.round((resultCalories * 0.5) / 4));
    setFats(Math.round((resultCalories * 0.25) / 9));
  };

  return (
    <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
      <div className="wolf-panel space-y-4 p-4 sm:p-5">
        <div>
          <h3 className="wolf-panel-title">Calculadora nutricional</h3>
          <p className="wolf-subtitle">Completa tus datos para obtener una referencia diaria.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="weight" className="text-[var(--wolf-app-muted)]">Peso (kg)</Label>
          <Input
            id="weight"
            type="number"
            min={30}
            max={300}
            className="wolf-control"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="height" className="text-[var(--wolf-app-muted)]">Altura (cm)</Label>
          <Input
            id="height"
            type="number"
            min={100}
            max={250}
            className="wolf-control"
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="age" className="text-[var(--wolf-app-muted)]">Edad</Label>
          <Input
            id="age"
            type="number"
            min={14}
            max={100}
            className="wolf-control"
            value={age}
            onChange={(e) => setAge(Number(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[var(--wolf-app-muted)]">Objetivo</Label>
          <Select
            onValueChange={(value: "loss" | "maintenance" | "gain") => setGoal(value)}
            defaultValue="maintenance"
          >
            <SelectTrigger className="wolf-control">
              <SelectValue placeholder="Selecciona un objetivo" />
            </SelectTrigger>
            <SelectContent className="border-[var(--wolf-app-border)] bg-[var(--wolf-app-surface-raised)] text-[var(--wolf-app-text)]">
              <SelectItem value="loss">Pérdida de peso</SelectItem>
              <SelectItem value="maintenance">Mantenimiento</SelectItem>
              <SelectItem value="gain">Ganancia de masa</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          className="wolf-button wolf-button-primary w-full"
          onClick={handleCalculate}
        >
          Calcular
        </Button>
      </div>

      <div className="wolf-panel p-4 sm:p-5">
        <h3 className="wolf-panel-title mb-1">Referencia diaria</h3>
        <p className="wolf-subtitle mb-5">Estimación orientativa basada en actividad moderada.</p>
        {calories !== null ? (
          <div className="grid grid-cols-2 gap-3">
            <Macro label="Calorías" value={`${calories.toFixed(0)} kcal`} featured />
            <Macro label="Proteínas" value={`${protein} g`} />
            <Macro label="Carbohidratos" value={`${carbs} g`} />
            <Macro label="Grasas" value={`${fats} g`} />
          </div>
        ) : (
          <div className="wolf-empty rounded-lg border border-dashed border-[var(--wolf-app-border)]">
            Ingresa tus datos para ver la estimación.
          </div>
        )}
      </div>
    </div>
  );
}

function Macro({ label, value, featured = false }: { label: string; value: string; featured?: boolean }) {
  return (
    <div className={`wolf-stat ${featured ? "col-span-2" : ""}`}>
      <span className="wolf-stat-label">{label}</span>
      <strong className={`wolf-stat-value ${featured ? "text-[var(--wolf-app-accent)]" : ""}`}>{value}</strong>
    </div>
  );
}
