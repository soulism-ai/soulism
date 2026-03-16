export function HeavenAnimation() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-2] bg-[#08080A]">
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-90"
      >
        <source src="/2.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
