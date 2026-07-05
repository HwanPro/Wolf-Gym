"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Story {
  id: string;
  title: string;
  content: string;
  imageUrl: string;
  link?: string;
}

export default function StoriesCarousel() {
  const [stories, setStories] = useState<Story[]>([]);
  const [current, setCurrent] = useState(0);

  const fetchStories = async () => {
    try {
      const res = await fetch("/api/stories");

      if (!res.ok) {
        throw new Error(`Error en la respuesta del servidor: ${res.status}`);
      }

      const data = await res.json();
      setStories(data);
    } catch (error) {
      console.error("Error al cargar stories:", error);
    }
  };

  useEffect(() => {
    fetchStories();
  }, []);

  useEffect(() => {
    if (stories.length < 2) return;

    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % stories.length);
    }, 4000);

    return () => clearInterval(interval);
  }, [stories.length]);

  useEffect(() => {
    if (stories.length === 0) {
      setCurrent(0);
      return;
    }
    if (current > stories.length - 1 || Number.isNaN(current)) {
      setCurrent(0);
    }
  }, [current, stories.length]);

  if (stories.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-lg border border-yellow-300/40 bg-yellow-400/10 px-4 py-6 text-center text-yellow-100">
        No hay promociones por el momento.
      </div>
    );
  }

  const currentStory = stories[current];
  const currentImage = currentStory.imageUrl
    ? `url("${currentStory.imageUrl}"), url("/icons/icon-512.png")`
    : `url("/icons/icon-512.png")`;

  return (
    <div className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-lg bg-yellow-400 shadow-lg">
      <div
        role="img"
        aria-label={currentStory.title}
        className="relative h-64 bg-[#141414] bg-center bg-no-repeat"
        style={{
          backgroundImage: currentImage,
          backgroundSize: currentStory.imageUrl ? "cover, 160px" : "160px",
        }}
      />
      <div className="p-4 bg-white text-black">
        <h3 className="font-bold text-lg">{currentStory.title}</h3>
        <p className="text-sm">{currentStory.content}</p>
        {currentStory.link && (
          <a
            href={currentStory.link}
            target="_blank"
            rel="noopener noreferrer"
            className="text-yellow-500 underline mt-2 inline-block"
          >
            Ver más
          </a>
        )}
      </div>
      <button
        type="button"
        className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 p-2 rounded-full text-white"
        onClick={() =>
          setCurrent((prev) => (prev === 0 ? stories.length - 1 : prev - 1))
        }
        aria-label="Historia anterior"
      >
        <ChevronLeft />
      </button>
      <button
        type="button"
        className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black bg-opacity-50 p-2 rounded-full text-white"
        onClick={() => setCurrent((prev) => (prev + 1) % stories.length)}
        aria-label="Siguiente historia"
      >
        <ChevronRight />
      </button>
    </div>
  );
}
