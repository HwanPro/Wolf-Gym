"use client";

import { useState, useEffect } from "react";
import ExerciseMediaDialog from "./ExerciseMediaDialog";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Eye,
  Upload,
  Check,
  X
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
  slug: string;
  description?: string;
  instructions?: string;
  commonMistakes?: string;
  tips?: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: string;
  level: string;
  mechanics: string;
  category: string;
  defaultRepMin?: number;
  defaultRepMax?: number;
  defaultRestSec?: number;
  tags: string[];
  isPublished: boolean;
  isVerified: boolean;
  media: Array<{
    id: string;
    type: string;
    url: string;
    isCover: boolean;
  }>;
}

const muscleOptions = [
  "Pecho", "Espalda", "Hombros", "Bíceps", "Tríceps", 
  "Cuádriceps", "Isquiotibiales", "Glúteos", "Gemelos", 
  "Core", "Antebrazos", "Trapecios"
];

const equipmentOptions = [
  "Barra olímpica", "Mancuernas", "Polea alta", "Polea baja", 
  "Máquina", "Peso corporal", "Bandas elásticas", "Kettlebell",
  "Barra Z", "Banco", "Barra de dominadas"
];

export default function ExerciseManagement() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMuscle, setFilterMuscle] = useState("");
  const [filterLevel, setFilterLevel] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    instructions: "",
    commonMistakes: "",
    tips: "",
    primaryMuscle: "",
    secondaryMuscles: [] as string[],
    equipment: "",
    level: "beginner" as "beginner" | "intermediate" | "advanced",
    mechanics: "compound" as "compound" | "isolation",
    category: "push" as "push" | "pull" | "legs" | "core" | "upper" | "lower" | "full-body" | "stretch" | "cardio",
    defaultRepMin: 8,
    defaultRepMax: 12,
    defaultRestSec: 90,
    tags: [] as string[]
  });

  useEffect(() => {
    loadExercises();
  }, [searchTerm, filterMuscle, filterLevel]);

  const loadExercises = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('query', searchTerm);
      if (filterMuscle) params.append('muscle', filterMuscle);
      if (filterLevel) params.append('level', filterLevel);
      
      const response = await fetch(`/api/exercises?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setExercises(data.items || []);
      }
    } catch (error) {
      console.error('Error loading exercises:', error);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingExercise ? `/api/exercises/${editingExercise.id}` : '/api/exercises';
      const method = editingExercise ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          defaultRepRange: {
            min: formData.defaultRepMin,
            max: formData.defaultRepMax
          }
        })
      });

      if (response.ok) {
        await loadExercises();
        resetForm();
        setIsCreateDialogOpen(false);
        setEditingExercise(null);
        alert(editingExercise ? 'Ejercicio actualizado' : 'Ejercicio creado');
      } else {
        const error = await response.json();
        alert(error.error || 'Error al guardar ejercicio');
      }
    } catch (error) {
      alert('Error al guardar ejercicio');
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este ejercicio?')) return;

    try {
      const response = await fetch(`/api/exercises/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadExercises();
        alert('Ejercicio eliminado');
      } else {
        const error = await response.json();
        alert(error.error || 'Error al eliminar ejercicio');
      }
    } catch (error) {
      alert('Error al eliminar ejercicio');
    }
  };

  const handleEdit = (exercise: Exercise) => {
    setFormData({
      name: exercise.name,
      description: exercise.description || "",
      instructions: exercise.instructions || "",
      commonMistakes: exercise.commonMistakes || "",
      tips: exercise.tips || "",
      primaryMuscle: exercise.primaryMuscle.toLowerCase().replaceAll("_", "-"),
      secondaryMuscles: exercise.secondaryMuscles,
      equipment: exercise.equipment.toLowerCase().replaceAll("_", "-"),
      level: exercise.level.toLowerCase() as any,
      mechanics: exercise.mechanics.toLowerCase() as any,
      category: exercise.category.toLowerCase().replaceAll("_", "-") as any,
      defaultRepMin: exercise.defaultRepMin || 8,
      defaultRepMax: exercise.defaultRepMax || 12,
      defaultRestSec: exercise.defaultRestSec || 90,
      tags: exercise.tags
    });
    setEditingExercise(exercise);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      instructions: "",
      commonMistakes: "",
      tips: "",
      primaryMuscle: "",
      secondaryMuscles: [],
      equipment: "",
      level: "beginner",
      mechanics: "compound",
      category: "push",
      defaultRepMin: 8,
      defaultRepMax: 12,
      defaultRestSec: 90,
      tags: []
    });
  };

  const togglePublished = async (exercise: Exercise) => {
    try {
      const response = await fetch(`/api/exercises/${exercise.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isPublished: !exercise.isPublished
        })
      });

      if (response.ok) {
        await loadExercises();
      }
    } catch (error) {
      console.error('Error toggling published status:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-white">Gestión de Ejercicios</h1>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-yellow-400 text-black hover:bg-yellow-500">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Ejercicio
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingExercise ? 'Editar Ejercicio' : 'Crear Nuevo Ejercicio'}
              </DialogTitle>
            </DialogHeader>
            <ExerciseForm 
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              loading={loading}
              muscleOptions={muscleOptions}
              equipmentOptions={equipmentOptions}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-white">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar ejercicios..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-gray-700 text-white border-gray-600"
                />
              </div>
            </div>
            <div>
              <Label className="text-white">Músculo</Label>
              <Select value={filterMuscle} onValueChange={value => setFilterMuscle(value === "all" ? "" : value)}>
                <SelectTrigger className="bg-gray-700 text-white border-gray-600">
                  <SelectValue placeholder="Todos los músculos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los músculos</SelectItem>
                  {muscleOptions.map(muscle => (
                    <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white">Nivel</Label>
              <Select value={filterLevel} onValueChange={value => setFilterLevel(value === "all" ? "" : value)}>
                <SelectTrigger className="bg-gray-700 text-white border-gray-600">
                  <SelectValue placeholder="Todos los niveles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los niveles</SelectItem>
                  <SelectItem value="beginner">Principiante</SelectItem>
                  <SelectItem value="intermediate">Intermedio</SelectItem>
                  <SelectItem value="advanced">Avanzado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                onClick={loadExercises}
                disabled={loading}
                className="w-full bg-yellow-400 text-black hover:bg-yellow-500"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtrar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exercise Table */}
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-700">
                <TableHead className="text-white">Nombre</TableHead>
                <TableHead className="text-white">Músculo</TableHead>
                <TableHead className="text-white">Equipo</TableHead>
                <TableHead className="text-white">Nivel</TableHead>
                <TableHead className="text-white">Estado</TableHead>
                <TableHead className="text-white">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {exercises.map((exercise) => (
                <TableRow key={exercise.id} className="border-gray-700">
                  <TableCell className="text-white font-medium">
                    {exercise.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{exercise.primaryMuscle}</Badge>
                  </TableCell>
                  <TableCell className="text-gray-300">
                    {exercise.equipment}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        exercise.level === 'beginner' ? 'default' :
                        exercise.level === 'intermediate' ? 'secondary' : 'destructive'
                      }
                    >
                      {exercise.level}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={exercise.isPublished ? "default" : "outline"}
                        onClick={() => togglePublished(exercise)}
                      >
                        {exercise.isPublished ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      </Button>
                      {exercise.isVerified && (
                        <Badge variant="default" className="bg-green-600">
                          Verificado
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEdit(exercise)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <ExerciseMediaDialog exerciseId={exercise.id} name={exercise.name} />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(exercise.id)}
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

      {/* Edit Dialog */}
      <Dialog open={!!editingExercise} onOpenChange={() => setEditingExercise(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Ejercicio</DialogTitle>
          </DialogHeader>
          <ExerciseForm 
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            loading={loading}
            muscleOptions={muscleOptions}
            equipmentOptions={equipmentOptions}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente del formulario
function ExerciseForm({ 
  formData, 
  setFormData, 
  onSubmit, 
  loading, 
  muscleOptions, 
  equipmentOptions 
}: {
  formData: any;
  setFormData: (data: any) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  muscleOptions: string[];
  equipmentOptions: string[];
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Nombre del Ejercicio</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label>Equipo</Label>
          <Select 
            value={formData.equipment} 
            onValueChange={(value) => setFormData((prev: any) => ({ ...prev, equipment: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar equipo" />
            </SelectTrigger>
            <SelectContent>
              {equipmentOptions.map(equipment => (
                <SelectItem key={equipment} value={equipment}>{equipment}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Descripción</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, description: e.target.value }))}
          rows={3}
        />
      </div>

      <div>
        <Label>Instrucciones (paso a paso)</Label>
        <Textarea
          value={formData.instructions}
          onChange={(e) => setFormData((prev: any) => ({ ...prev, instructions: e.target.value }))}
          rows={4}
          placeholder="1. Primer paso&#10;2. Segundo paso&#10;3. Tercer paso..."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Errores Comunes</Label>
          <Textarea
            value={formData.commonMistakes}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, commonMistakes: e.target.value }))}
            rows={3}
          />
        </div>
        <div>
          <Label>Consejos</Label>
          <Textarea
            value={formData.tips}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, tips: e.target.value }))}
            rows={3}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Músculo Principal</Label>
          <Select 
            value={formData.primaryMuscle} 
            onValueChange={(value) => setFormData((prev: any) => ({ ...prev, primaryMuscle: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar músculo" />
            </SelectTrigger>
            <SelectContent>
              {muscleOptions.map(muscle => (
                <SelectItem key={muscle} value={muscle}>{muscle}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Nivel</Label>
          <Select 
            value={formData.level} 
            onValueChange={(value) => setFormData((prev: any) => ({ ...prev, level: value }))}
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
        <div>
          <Label>Mecánica</Label>
          <Select 
            value={formData.mechanics} 
            onValueChange={(value) => setFormData((prev: any) => ({ ...prev, mechanics: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="compound">Compuesto</SelectItem>
              <SelectItem value="isolation">Aislamiento</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Repeticiones Mínimas</Label>
          <Input
            type="number"
            value={formData.defaultRepMin}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, defaultRepMin: parseInt(e.target.value) }))}
            min="1"
          />
        </div>
        <div>
          <Label>Repeticiones Máximas</Label>
          <Input
            type="number"
            value={formData.defaultRepMax}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, defaultRepMax: parseInt(e.target.value) }))}
            min="1"
          />
        </div>
        <div>
          <Label>Descanso (segundos)</Label>
          <Input
            type="number"
            value={formData.defaultRestSec}
            onChange={(e) => setFormData((prev: any) => ({ ...prev, defaultRestSec: parseInt(e.target.value) }))}
            min="0"
          />
        </div>
      </div>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" disabled={loading}>
          Cancelar
        </Button>
        <Button 
          type="submit" 
          disabled={loading}
          className="bg-yellow-400 text-black hover:bg-yellow-500"
        >
          {loading ? 'Guardando...' : 'Guardar Ejercicio'}
        </Button>
      </div>
    </form>
  );
}
