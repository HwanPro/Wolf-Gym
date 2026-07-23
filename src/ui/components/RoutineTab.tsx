"use client";

import { useState, useEffect } from "react";
import { 
  Dumbbell, 
  Play, 
  Eye, 
  Calendar,
  Plus,
  Timer,
  Save
} from "lucide-react";
import { Button } from "@/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";
import { Badge } from "@/ui/badge";
import { Input } from "@/ui/input";
import Swal from "sweetalert2";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

interface RoutinesTabProps {
  gender: "male" | "female";
  fitnessGoal: string;
  setFitnessGoal: (value: string) => void;
  bodyFocus: string;
  setBodyFocus: (value: string) => void;
}

interface Exercise {
  id: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  level: string;
  description?: string;
  instructions?: string;
  media: Array<{
    id: string;
    type: string;
    url: string;
    isCover: boolean;
  }>;
}

interface WorkoutSet {
  id?: string;
  reps: number;
  weight: number;
  restSeconds?: number;
  completed: boolean;
}

interface WorkoutExercise {
  id: string;
  exercise: Exercise;
  sets: WorkoutSet[];
  notes?: string;
}

interface ActiveWorkout {
  id: string;
  status: string;
  notes?: string;
}

interface RecentWorkout {
  id: string;
  date: string;
  routineName: string;
  duration: number;
  totalVolume: number;
  totalSets: number;
}

export default function RoutinesTab({ 
  fitnessGoal
}: RoutinesTabProps) {
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([]);
  const [recentWorkouts, setRecentWorkouts] = useState<RecentWorkout[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState<ActiveWorkout | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>([]);
  // Técnica (pendiente de modal en siguiente paso)
  const [searchQuery, setSearchQuery] = useState("");

  // Cargar datos iniciales
  useEffect(() => {
    loadRecentWorkouts();
    loadAvailableExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recargar ejercicios cuando cambia la búsqueda
  useEffect(() => {
    loadAvailableExercises();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const loadRecentWorkouts = async () => {
    try {
      const response = await fetch('/api/workouts/recent?limit=50');
      if (response.ok) {
        const data = await response.json();
        setRecentWorkouts(data.recentWorkouts || []);
      }
    } catch (error) {
      console.error('Error loading recent workouts:', error);
    }
  };

  const loadAvailableExercises = async () => {
    try {
      const url = `/api/exercises?published=true&limit=100${searchQuery ? `&query=${encodeURIComponent(searchQuery)}` : ''}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setAvailableExercises(data.items || []);
      }
    } catch (error) {
      console.error('❌ Error loading exercises:', error);
    }
  };

  const startWorkout = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: new Date().toISOString(),
          notes: `Entrenamiento ${fitnessGoal}`
        })
      });

      if (response.ok) {
        const workout = await response.json();
        setActiveWorkout({ id: workout.id, status: workout.status });
        
        // SweetAlert de éxito
        await Swal.fire({
          title: 'Entrenamiento iniciado',
          text: 'Tu sesión de entrenamiento ha comenzado.',
          icon: 'success',
          confirmButtonText: 'Continuar',
          confirmButtonColor: '#EAB308',
          background: '#1F2937',
          color: '#F9FAFB',
          timer: 3000,
          timerProgressBar: true
        });
        
      } else {
        const error = await response.json();
        
        // SweetAlert de error
        await Swal.fire({
          title: 'Error al iniciar',
          text: error.error || "No se pudo iniciar el entrenamiento",
          icon: 'error',
          confirmButtonText: 'Intentar de nuevo',
          confirmButtonColor: '#EF4444',
          background: '#1F2937',
          color: '#F9FAFB'
        });
      }
    } catch (err) {
      console.error('Error:', err);
      
      // SweetAlert de error de conexión
      await Swal.fire({
        title: 'Error de conexión',
        text: 'No se pudo conectar con el servidor. Verifica tu conexión.',
        icon: 'error',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#EF4444',
        background: '#1F2937',
        color: '#F9FAFB'
      });
    }
    setLoading(false);
  };

  const addExerciseToWorkout = async (exerciseId: string) => {
    if (!activeWorkout) return;
    try {
      const exercise = availableExercises.find(ex => ex.id === exerciseId);
      if (!exercise) return;
      const res = await fetch(`/api/workouts/${activeWorkout.id}/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseId })
      });
      if (!res.ok) throw new Error('No se pudo agregar el ejercicio');
      const created = await res.json();
      const newWorkoutExercise: WorkoutExercise = {
        id: created.id,
        exercise,
        sets: [],
        notes: ''
      };
      setWorkoutExercises(prev => [...prev, newWorkoutExercise]);
      toast.success(`${exercise.name} agregado`, { position: "bottom-right", autoClose: 1200, theme: "dark" });
    } catch (error) {
      console.error('Error adding exercise:', error);
      await Swal.fire({
        title: 'Error',
        text: 'No se pudo agregar el ejercicio',
        icon: 'error',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#EF4444',
        background: '#1F2937',
        color: '#F9FAFB'
      });
    }
  };

  const finishWorkout = async () => {
    if (!activeWorkout) return;
    
    const result = await Swal.fire({
      title: '¿Finalizar entrenamiento?',
      text: 'Se guardará tu progreso y se cerrará la sesión',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, finalizar',
      cancelButtonText: 'Continuar entrenando',
      confirmButtonColor: '#EAB308',
      cancelButtonColor: '#6B7280',
      background: '#1F2937',
      color: '#F9FAFB'
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`/api/workouts/${activeWorkout.id}/complete`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          setActiveWorkout(null);
          setWorkoutExercises([]);
          await loadRecentWorkouts();
          
          await Swal.fire({
            title: 'Entrenamiento completado',
            text: 'Tu progreso ha sido guardado.',
            icon: 'success',
            confirmButtonText: 'Genial',
            confirmButtonColor: '#EAB308',
            background: '#1F2937',
            color: '#F9FAFB'
          });
        }
      } catch (error) {
        console.error('Error finishing workout:', error);
      }
    }
  };

  // Vista principal
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <ToastContainer />
      {/* Entrenamiento Activo o Botón para iniciar */}
      {activeWorkout ? (
        <Card className="wolf-panel border-[var(--wolf-app-success)]/40 bg-[var(--wolf-app-surface-raised)] shadow-none">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--wolf-app-text)]">
                  <Timer className="h-6 w-6" />
                  Entrenamiento en progreso
                </h3>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    placeholder="Nombre del entrenamiento"
                    defaultValue={activeWorkout?.notes?.split(" - ")[0] || "Entrenamiento libre"}
                    onBlur={async (e) => {
                      const name = e.target.value?.trim();
                      if (!name || !activeWorkout) return;
                      await fetch(`/api/workouts/${activeWorkout.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
                      toast.info('Nombre guardado', { position: 'bottom-right', autoClose: 1000, theme: 'dark' });
                    }}
                    className="wolf-control h-9 w-full sm:w-64"
                  />
                  <span className="text-xs text-[var(--wolf-app-muted)]">{workoutExercises.length} ejercicios</span>
                </div>
              </div>
              <Button 
                onClick={finishWorkout}
                variant="outline"
                className="wolf-button wolf-button-primary w-full sm:w-auto"
              >
                <Save className="h-4 w-4 mr-2" />
                Finalizar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="wolf-panel bg-[var(--wolf-app-surface-raised)] shadow-none">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold text-[var(--wolf-app-text)]">¿Listo para entrenar?</h3>
                <p className="mt-1 text-sm text-[var(--wolf-app-muted)]">Inicia una nueva sesión y registra tus series.</p>
              </div>
              <Button 
                onClick={startWorkout}
                disabled={loading}
                size="lg"
                className="wolf-button wolf-button-primary w-full sm:w-auto"
              >
                <Play className="h-6 w-6 mr-2" />
                {loading ? 'Iniciando...' : 'Iniciar Entrenamiento'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ejercicios del entrenamiento activo */}
      {activeWorkout && workoutExercises.length > 0 && (
        <Card className="wolf-panel shadow-none">
          <CardHeader className="border-b border-[var(--wolf-app-border)] p-4 sm:p-5">
            <CardTitle className="flex items-center gap-2 text-base text-[var(--wolf-app-text)]">
              <Dumbbell className="h-5 w-5 text-[var(--wolf-app-accent)]" />
              Ejercicios del entrenamiento ({workoutExercises.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {workoutExercises.map((workoutExercise, index) => (
                <WorkoutExerciseCard 
                  key={workoutExercise.id} 
                  workoutExercise={workoutExercise}
                  exerciseNumber={index + 1}
                  onUpdateSets={(sets: WorkoutSet[]) => {
                    // Actualizar sets en el estado local
                    setWorkoutExercises(prev => 
                      prev.map(we => 
                        we.id === workoutExercise.id 
                          ? { ...we, sets } 
                          : we
                      )
                    );
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entrenamientos recientes */}
      {recentWorkouts.length > 0 && (
        <Card className="wolf-panel shadow-none">
          <CardHeader className="border-b border-[var(--wolf-app-border)] p-4 sm:p-5">
            <CardTitle className="flex items-center gap-2 text-base text-[var(--wolf-app-text)]">
              <Calendar className="h-5 w-5 text-[var(--wolf-app-accent)]" />
              Entrenamientos recientes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 max-h-72 overflow-y-auto">
            {Object.entries(
              recentWorkouts.reduce((acc: Record<string, RecentWorkout[]>, w: RecentWorkout) => {
                const d = new Date(w.date);
                const key = d.toLocaleDateString();
                if (!acc[key]) acc[key] = [];
                acc[key].push(w);
                return acc;
              }, {})
            ).map(([date, items]) => (
              <div key={date} className="mb-3">
                <div className="mb-1 text-xs text-[var(--wolf-app-faint)]">{date}</div>
                <div className="grid gap-2 md:grid-cols-2">
                  {items.map((workout) => (
                    <div key={workout.id} className="flex items-center justify-between rounded-lg border border-[var(--wolf-app-border)] bg-[var(--wolf-app-surface-raised)] p-3">
                      <div>
                        <p className="font-semibold text-[var(--wolf-app-text)]">{workout.routineName}</p>
                        <p className="text-xs text-[var(--wolf-app-muted)]">{workout.duration} min</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-[var(--wolf-app-accent)]">{workout.totalVolume} kg</p>
                        <p className="text-xs text-[var(--wolf-app-muted)]">{workout.totalSets} series</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Ejercicios disponibles */}
      <Card className="wolf-panel shadow-none">
        <CardHeader className="border-b border-[var(--wolf-app-border)] p-4 sm:p-5">
          <CardTitle className="flex items-center gap-2 text-base text-[var(--wolf-app-text)]">
            <Dumbbell className="h-5 w-5 text-[var(--wolf-app-accent)]" />
            Biblioteca de ejercicios
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {/* Búsqueda */}
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder="Buscar ejercicio, músculo o equipo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="wolf-control max-w-md"
            />
            <Button onClick={loadAvailableExercises} className="wolf-button w-full sm:w-auto">Buscar</Button>
          </div>
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--wolf-app-accent)] border-r-transparent"></div>
              <span className="ml-2 text-[var(--wolf-app-muted)]">Cargando ejercicios...</span>
            </div>
          ) : availableExercises.length > 0 ? (
            <div className="space-y-6">
              {Object.entries(
                availableExercises.reduce((acc: Record<string, Exercise[]>, ex) => {
                  const key = ex.primaryMuscle || 'Otros';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(ex);
                  return acc;
                }, {})
              ).map(([muscle, list]) => (
                <div key={muscle} className="space-y-2">
                  <h4 className="font-semibold text-[var(--wolf-app-text)]">{muscle}</h4>
                  <div className="overflow-x-auto pb-2">
                    <div className="grid min-w-max auto-cols-[17rem] grid-flow-col grid-rows-2 gap-3 sm:auto-cols-[20rem]">
                      {list.map((exercise) => (
                        <div key={exercise.id} className="w-full space-y-3 rounded-lg border border-[var(--wolf-app-border)] bg-[var(--wolf-app-surface-raised)] p-4 transition-colors hover:border-[var(--wolf-app-border-strong)]">
                          <div className="flex justify-between items-start">
                            <h4 className="pr-2 text-sm font-semibold leading-tight text-[var(--wolf-app-text)]">{exercise.name}</h4>
                            <div className="flex gap-1 flex-shrink-0">
                              {activeWorkout && (
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="text-[var(--wolf-app-success)] hover:bg-white/5 hover:text-[var(--wolf-app-success)]"
                                  onClick={() => addExerciseToWorkout(exercise.id)}
                                  title="Agregar al entrenamiento"
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="text-[var(--wolf-app-muted)] hover:bg-white/5 hover:text-[var(--wolf-app-accent)]" title="Ver detalles">
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="secondary" className="border border-[var(--wolf-app-border)] bg-[var(--wolf-app-accent)]/10 text-xs text-[var(--wolf-app-accent)]">
                              {exercise.primaryMuscle}
                            </Badge>
                            <Badge variant="outline" className="border-[var(--wolf-app-border)] text-xs text-[var(--wolf-app-muted)]">
                              {exercise.level}
                            </Badge>
                            <Badge variant="outline" className="border-[var(--wolf-app-border)] text-xs text-[var(--wolf-app-muted)]">
                              {exercise.equipment}
                            </Badge>
                          </div>
                          {exercise.description && (
                            <p className="line-clamp-2 text-xs text-[var(--wolf-app-muted)]">{exercise.description}</p>
                          )}
                          {activeWorkout && (
                            <Button 
                              size="sm" 
                              className="wolf-button wolf-button-primary w-full"
                              onClick={() => addExerciseToWorkout(exercise.id)}
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Agregar al entrenamiento
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="wolf-empty">
              <Dumbbell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No hay ejercicios disponibles</p>
              <p className="text-sm">Los ejercicios se cargarán pronto</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estadísticas rápidas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="wolf-stat shadow-none">
          <CardContent className="pt-4 pb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--wolf-app-accent)]">0</div>
              <div className="text-xs text-[var(--wolf-app-muted)]">Esta semana</div>
            </div>
          </CardContent>
        </Card>
        <Card className="wolf-stat shadow-none">
          <CardContent className="pt-4 pb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--wolf-app-text)]">0 kg</div>
              <div className="text-xs text-[var(--wolf-app-muted)]">Volumen total</div>
            </div>
          </CardContent>
        </Card>
        <Card className="wolf-stat shadow-none">
          <CardContent className="pt-4 pb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--wolf-app-success)]">0</div>
              <div className="text-xs text-[var(--wolf-app-muted)]">PRs este mes</div>
            </div>
          </CardContent>
        </Card>
        <Card className="wolf-stat shadow-none">
          <CardContent className="pt-4 pb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-[var(--wolf-app-text)]">{availableExercises.length}</div>
              <div className="text-xs text-[var(--wolf-app-muted)]">Ejercicios</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Componente para mostrar y editar ejercicios del entrenamiento
interface WorkoutExerciseCardProps {
  workoutExercise: WorkoutExercise;
  exerciseNumber: number;
  onUpdateSets: (sets: WorkoutSet[]) => void;
}

function WorkoutExerciseCard({ workoutExercise, exerciseNumber, onUpdateSets }: WorkoutExerciseCardProps) {
  const [sets, setSets] = useState<WorkoutSet[]>(workoutExercise.sets || []);

  const addSet = () => {
    const newSet: WorkoutSet = {
      reps: 10,
      weight: 0,
      completed: false
    };
    const updatedSets = [...sets, newSet];
    setSets(updatedSets);
    onUpdateSets(updatedSets);
  };

  const updateSet = (index: number, field: keyof WorkoutSet, value: number | boolean) => {
    const updatedSets = sets.map((set, i) => 
      i === index ? { ...set, [field]: value } : set
    );
    setSets(updatedSets);
    onUpdateSets(updatedSets);
  };

  const removeSet = (index: number) => {
    const updatedSets = sets.filter((_, i) => i !== index);
    setSets(updatedSets);
    onUpdateSets(updatedSets);
  };

  return (
    <div className="space-y-4 rounded-lg border border-[var(--wolf-app-border)] bg-[var(--wolf-app-surface-raised)] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="font-semibold text-[var(--wolf-app-text)]">
            {exerciseNumber}. {workoutExercise.exercise.name}
          </h4>
          <div className="flex gap-2 mt-1">
            <Badge variant="secondary" className="border border-[var(--wolf-app-border)] bg-[var(--wolf-app-accent)]/10 text-xs text-[var(--wolf-app-accent)]">
              {workoutExercise.exercise.primaryMuscle}
            </Badge>
            <Badge variant="outline" className="border-[var(--wolf-app-border)] text-xs text-[var(--wolf-app-muted)]">
              {workoutExercise.exercise.equipment}
            </Badge>
          </div>
        </div>
        <Button
          size="sm"
          onClick={addSet}
          className="wolf-button w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar Serie
        </Button>
      </div>

      {/* Sets */}
      <div className="space-y-2">
        <div className="hidden grid-cols-[48px_1fr_1fr_76px] gap-2 px-2 text-xs font-medium text-[var(--wolf-app-faint)] sm:grid">
          <span>Serie</span>
          <span>Peso (kg)</span>
          <span>Reps</span>
          <span>Acción</span>
        </div>
        
        {sets.map((set, index) => (
          <div key={index} className="grid grid-cols-[36px_1fr_1fr] items-center gap-2 rounded-lg border border-[var(--wolf-app-border)] bg-[var(--wolf-app-surface)] p-2 sm:grid-cols-[48px_1fr_1fr_76px]">
            <span className="text-sm font-medium text-[var(--wolf-app-muted)]">{index + 1}</span>
            
            <Input
              type="number"
              value={set.weight}
              onChange={(e) => updateSet(index, 'weight', parseFloat(e.target.value) || 0)}
              aria-label={`Peso de la serie ${index + 1}`}
              className="wolf-control h-9 text-sm"
              min="0"
              step="0.5"
            />
            
            <Input
              type="number"
              value={set.reps}
              onChange={(e) => updateSet(index, 'reps', parseInt(e.target.value) || 0)}
              aria-label={`Repeticiones de la serie ${index + 1}`}
              className="wolf-control h-9 text-sm"
              min="1"
            />
            
            <div className="col-span-3 flex justify-end gap-1 sm:col-span-1">
              <Button
                size="sm"
                variant={set.completed ? "default" : "outline"}
                onClick={() => updateSet(index, 'completed', !set.completed)}
                className={`h-8 px-2 text-xs ${
                  set.completed 
                    ? 'bg-[var(--wolf-app-success)] text-[var(--wolf-app-bg)] hover:bg-[var(--wolf-app-success)]'
                    : 'border-[var(--wolf-app-border)] text-[var(--wolf-app-muted)] hover:bg-white/5 hover:text-[var(--wolf-app-success)]'
                }`}
              >
                ✓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removeSet(index)}
                className="h-8 px-2 text-[var(--wolf-app-danger)] hover:bg-red-500/10 hover:text-[var(--wolf-app-danger)]"
              >
                ×
              </Button>
            </div>
          </div>
        ))}
        
        {sets.length === 0 && (
          <div className="wolf-empty py-4">
            <p className="text-sm">No hay series agregadas</p>
            <Button
              size="sm"
              onClick={addSet}
              variant="outline"
              className="wolf-button mt-2"
            >
              <Plus className="h-4 w-4 mr-1" />
              Agregar primera serie
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
