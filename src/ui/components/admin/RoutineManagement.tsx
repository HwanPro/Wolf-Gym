"use client";

import { useState, useEffect } from "react";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Users,
  Dumbbell,
  Calendar
} from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Input } from "@/ui/input";
import { Label } from "@/ui/label";
import { Textarea } from "@/ui/textarea";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/ui/select";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/ui/dialog";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/ui/table";

interface Exercise {
  id: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  level: string;
}

interface RoutineItem {
  exerciseId: string;
  id: string;
  exercise: Exercise;
  order: number;
  targetRepsMin?: number;
  targetRepsMax?: number;
  targetSets?: number;
  targetRPE?: number;
  targetRestSec?: number;
  notes?: string;
  isOptional: boolean;
}

interface Routine {
  id: string;
  name: string;
  description?: string;
  goal: string;
  level: string;
  dayIndex?: number | null;
  isPublished: boolean;
  items: RoutineItem[];
  _count: {
    userAssignments: number;
  };
}

export default function RoutineManagement() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterGoal, setFilterGoal] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [showExercises, setShowExercises] = useState<string | null>(null);

  const [published, setPublished] = useState(false);
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    goal: "strength" as "strength" | "hypertrophy" | "endurance",
    level: "beginner" as "beginner" | "intermediate" | "advanced",
    dayIndex: undefined as number | undefined
  });

  // Exercise selection state
  const [selectedExercises, setSelectedExercises] = useState<{
    exerciseId: string;
    targetSets: number;
    targetRepsMin: number;
    targetRepsMax: number;
    targetRestSec: number;
    targetRPE?: number;
    notes: string;
    isOptional: boolean;
  }[]>([]);

  useEffect(() => {
    loadRoutines();
    loadExercises();
  }, [searchTerm, filterGoal]);

  const loadRoutines = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('query', searchTerm);
      if (filterGoal) params.append('goal', filterGoal);
      
      const response = await fetch(`/api/routines?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setRoutines(data.items || []);
      }
    } catch (error) {
      console.error('Error loading routines:', error);
    }
    setLoading(false);
  };

  const loadExercises = async () => {
    try {
      const response = await fetch('/api/exercises?published=true&limit=100');
      if (response.ok) {
        const data = await response.json();
        setExercises(data.items || []);
      }
    } catch (error) {
      console.error('Error loading exercises:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const routineResponse = await fetch(editingRoutine ? `/api/routines/${editingRoutine.id}` : '/api/routines', {
        method: editingRoutine ? 'PUT' : 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...formData, dayIndex: formData.dayIndex ?? null, isPublished: published, items: selectedExercises.map((item, i) => ({...item, order: i + 1}))})
      });
      if (routineResponse.ok) {
        await loadRoutines();
        resetForm();
        setIsCreateDialogOpen(false);
        alert('Rutina creada exitosamente');
      } else {
        const error = await routineResponse.json();
        alert(error.error || 'Error al crear rutina');
      }
    } catch (error) {
      alert('Error al crear rutina');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta rutina?')) return;

    try {
      const response = await fetch(`/api/routines/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadRoutines();
        alert('Rutina eliminada');
      } else {
        const error = await response.json();
        alert(error.error || 'Error al eliminar rutina');
      }
    } catch (error) {
      alert('Error al eliminar rutina');
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      goal: "strength",
      level: "beginner",
      dayIndex: undefined
    });
    setSelectedExercises([]);
    setEditingRoutine(null); setPublished(false);
  };

  const addExerciseToRoutine = () => {
    setSelectedExercises([...selectedExercises, {
      exerciseId: "",
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      targetRestSec: 90,
      notes: "",
      isOptional: false
    }]);
  };

  const removeExerciseFromRoutine = (index: number) => {
    setSelectedExercises(selectedExercises.filter((_, i) => i !== index));
  };

  const updateExerciseInRoutine = (index: number, field: string, value: any) => {
    const updated = [...selectedExercises];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedExercises(updated);
  };

  const getDayName = (dayIndex?: number | null) => {
    if (dayIndex == null) return "Flexible";
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    return days[dayIndex];
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Gestión de Rutinas</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm} className="bg-yellow-400 text-black hover:bg-yellow-500">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Rutina
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRoutine ? "Editar Rutina" : "Crear Nueva Rutina"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
<label><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} /> Publicada</label>

              {/* Información básica */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Nombre de la Rutina</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="ej. PUSH A, PULL B, LEGS"
                    required
                  />
                </div>
                <div>
                  <Label>Día de la Semana (Opcional)</Label>
                  <Select 
                    value={formData.dayIndex?.toString() || ""} 
                    onValueChange={(value) => setFormData(prev => ({ 
                      ...prev, 
                      dayIndex: value === 'all' ? undefined : Number(value)
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Día flexible" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Flexible</SelectItem>
                      <SelectItem value="0">Domingo</SelectItem>
                      <SelectItem value="1">Lunes</SelectItem>
                      <SelectItem value="2">Martes</SelectItem>
                      <SelectItem value="3">Miércoles</SelectItem>
                      <SelectItem value="4">Jueves</SelectItem>
                      <SelectItem value="5">Viernes</SelectItem>
                      <SelectItem value="6">Sábado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe el enfoque y objetivos de esta rutina..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Objetivo</Label>
                  <Select 
                    value={formData.goal} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, goal: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="strength">Fuerza</SelectItem>
                      <SelectItem value="hypertrophy">Hipertrofia</SelectItem>
                      <SelectItem value="endurance">Resistencia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nivel</Label>
                  <Select 
                    value={formData.level} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, level: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Principiante</SelectItem>
                      <SelectItem value="intermediate">Intermedio</SelectItem>
                      <SelectItem value="advanced">Avanzado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Ejercicios */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <Label className="text-lg">Ejercicios de la Rutina</Label>
                  <Button type="button" onClick={addExerciseToRoutine} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Ejercicio
                  </Button>
                </div>

                <div className="space-y-4">
                  {selectedExercises.map((item, index) => (
                    <Card key={index} className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                        <div className="md:col-span-2">
                          <Label>Ejercicio</Label>
                          <Select 
                            value={item.exerciseId} 
                            onValueChange={(value) => updateExerciseInRoutine(index, 'exerciseId', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar ejercicio" />
                            </SelectTrigger>
                            <SelectContent>
                              {exercises.map(exercise => (
                                <SelectItem key={exercise.id} value={exercise.id}>
                                  {exercise.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Series</Label>
                          <Input
                            type="number"
                            value={item.targetSets}
                            onChange={(e) => updateExerciseInRoutine(index, 'targetSets', parseInt(e.target.value))}
                            min="1"
                          />
                        </div>
                        <div>
                          <Label>Reps Min</Label>
                          <Input
                            type="number"
                            value={item.targetRepsMin}
                            onChange={(e) => updateExerciseInRoutine(index, 'targetRepsMin', parseInt(e.target.value))}
                            min="1"
                          />
                        </div>
                        <div>
                          <Label>Reps Max</Label>
                          <Input
                            type="number"
                            value={item.targetRepsMax}
                            onChange={(e) => updateExerciseInRoutine(index, 'targetRepsMax', parseInt(e.target.value))}
                            min="1"
                          />
                        </div>
                        <div>
                          <Button 
                            type="button" 
                            variant="destructive" 
                            size="sm"
                            onClick={() => removeExerciseFromRoutine(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="text-sm">Descanso (segundos)
                          <Input type="number" min="0" step="1" required
                            aria-label={`Descanso del ejercicio ${index + 1}`}
                            value={item.targetRestSec}
                            onChange={event => updateExerciseInRoutine(index, 'targetRestSec', Number(event.target.value))} />
                        </label>
                        <label className="text-sm">Esfuerzo RPE (1–10, opcional)
                          <Input type="number" min="1" max="10" step="0.5"
                            aria-label={`Esfuerzo RPE del ejercicio ${index + 1}`}
                            value={item.targetRPE ?? ''}
                            onChange={event => updateExerciseInRoutine(index, 'targetRPE', event.target.value === '' ? undefined : Number(event.target.value))} />
                        </label>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCreateDialogOpen(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading || selectedExercises.length === 0}
                  className="bg-yellow-400 text-black hover:bg-yellow-500"
                >
                  {loading ? 'Guardando...' : editingRoutine ? 'Guardar Rutina' : 'Crear Rutina'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-white">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar rutinas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-700 text-white border-gray-600"
                />
              </div>
            </div>
            <div>
              <Label className="text-white">Objetivo</Label>
              <Select value={filterGoal} onValueChange={value => setFilterGoal(value === "all" ? "" : value)}>
                <SelectTrigger className="bg-gray-700 text-white border-gray-600">
                  <SelectValue placeholder="Todos los objetivos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los objetivos</SelectItem>
                  <SelectItem value="strength">Fuerza</SelectItem>
                  <SelectItem value="hypertrophy">Hipertrofia</SelectItem>
                  <SelectItem value="endurance">Resistencia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                onClick={loadRoutines}
                disabled={loading}
                className="w-full bg-yellow-400 text-black hover:bg-yellow-500"
              >
                Filtrar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Routines Table */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700">
                <TableHead className="text-white">Nombre</TableHead>
                <TableHead className="text-white">Objetivo</TableHead>
                <TableHead className="text-white">Nivel</TableHead>
                <TableHead className="text-white">Día</TableHead>
                <TableHead className="text-white">Ejercicios</TableHead>
                <TableHead className="text-white">Usuarios</TableHead>
                <TableHead className="text-white">Estado</TableHead>
                <TableHead className="text-white">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routines.map((routine) => (
                <TableRow key={routine.id} className="border-gray-700">
                  <TableCell className="text-white font-medium">
                    {routine.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{routine.goal}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        routine.level === 'beginner' ? 'default' :
                        routine.level === 'intermediate' ? 'secondary' : 'destructive'
                      }
                    >
                      {routine.level}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-gray-300">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {getDayName(routine.dayIndex)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowExercises(showExercises === routine.id ? null : routine.id)}
                    >
                      <Dumbbell className="h-4 w-4 mr-1" />
                      {routine.items.length}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-gray-300">
                      <Users className="h-4 w-4" />
                      {routine._count.userAssignments}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button type="button" aria-label={`Editar rutina ${routine.name}`} onClick={() => {
 setEditingRoutine(routine); setPublished(routine.isPublished);
 setFormData({name: routine.name, description: routine.description || '', goal: routine.goal as 'strength', level: routine.level as 'beginner', dayIndex: routine.dayIndex ?? undefined});
   setSelectedExercises(routine.items.map(item => ({exerciseId: item.exerciseId ?? item.exercise.id, targetSets: item.targetSets ?? 3, targetRepsMin: item.targetRepsMin ?? 8, targetRepsMax: item.targetRepsMax ?? 12, targetRestSec: item.targetRestSec ?? 60, targetRPE: item.targetRPE ?? undefined, notes: item.notes || '', isOptional: item.isOptional})));
 setIsCreateDialogOpen(true);
 }}>Editar</Button>
<Badge variant={routine.isPublished ? "default" : "secondary"}>
                      {routine.isPublished ? "Publicada" : "Borrador"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(routine.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Exercise Details */}
      {showExercises && (
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">
              Ejercicios - {routines.find(r => r.id === showExercises)?.name}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {routines.find(r => r.id === showExercises)?.items.map((item, index) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-4">
                    <Badge variant="outline">{index + 1}</Badge>
                    <div>
                      <p className="text-white font-medium">{item.exercise.name}</p>
                      <p className="text-gray-400 text-sm">
                        {item.targetSets} series × {item.targetRepsMin}-{item.targetRepsMax} reps
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary">{item.exercise.primaryMuscle}</Badge>
                    {item.isOptional && <Badge variant="outline">Opcional</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
