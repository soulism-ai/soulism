"use client";

import { useWindowSize } from "@uidotdev/usehooks";
import React, { useEffect, useRef } from "react";

export const MatrixBackground: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const windowState = useWindowSize();
    
    // Ensure width and height have defaults for SSR/initial render
    const width = windowState.width || 20000;
    const height = windowState.height || 20000;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext("2d");
        if (!context) return;

        // Katakana + Latin + Digits
        const characters = "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレゲゼデベペオォコソトノホモヨョロゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const fontSize = 16;
        const columns = Math.ceil(width / fontSize);

        // Store drop Y position and speed for each column
        const drops: number[] = Array(columns).fill(1).map(() => Math.random() * -100);
        const speeds: number[] = Array(columns).fill(1).map(() => 0.5 + Math.random() * 1.5);

        const draw = () => {
            // Semi-transparent black to create fading trail effect
            context.fillStyle = "rgba(0, 0, 0, 0.05)";
            context.fillRect(0, 0, canvas.width, canvas.height);
            
            context.font = `${fontSize}px monospace`;

            drops.forEach((drop, index) => {
                const text = characters.charAt(Math.floor(Math.random() * characters.length));
                const x = index * fontSize;
                const y = drop * fontSize;

                // Occasional white lead character, otherwise bright green
                const isLead = Math.random() > 0.95;
                if (isLead) {
                    context.fillStyle = "#FFF";
                } else {
                    // Slight variation in green intensity
                    const greenIntensity = Math.floor(150 + Math.random() * 105);
                    context.fillStyle = `rgb(0, ${greenIntensity}, 0)`;
                }

                context.fillText(text, x, y);
                
                // Reset drop to top randomly if it passed screen
                if (y > canvas.height && Math.random() > 0.975) {
                    drops[index] = 0;
                    speeds[index] = 0.5 + Math.random() * 1.5; // New speed
                }
                
                drops[index] += speeds[index]; // Move down at dynamic speed
            });
        };

        const interval = setInterval(draw, 33); // ~30fps for smooth animation

        return () => clearInterval(interval);
    }, [width, height]);

    return (
        <canvas
            className="bg-black" // Change background class to white
            ref={canvasRef}
            width={width}
            height={height}
            style={{ position: "fixed", top: 0, left: 0, zIndex: -1 }}
        />
    );
};