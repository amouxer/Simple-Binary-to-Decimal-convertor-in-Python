/* Animated Particles Background */
(function initParticles() {
  const container = document.getElementById('particles');
  if (!container) return;

  const PARTICLE_COUNT = 50;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';

    const size = Math.random() * 4 + 1;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.top = Math.random() * 100 + '%';
    particle.style.opacity = Math.random() * 0.4 + 0.1;
    particle.style.animationDuration = (Math.random() * 8 + 4) + 's';
    particle.style.animationDelay = (Math.random() * 5) + 's';

    const colors = [
      'rgba(108, 92, 231, 0.6)',
      'rgba(0, 206, 201, 0.5)',
      'rgba(253, 121, 168, 0.4)',
      'rgba(162, 155, 254, 0.5)',
    ];
    particle.style.background = colors[Math.floor(Math.random() * colors.length)];
    particle.style.boxShadow = '0 0 6px ' + particle.style.background;

    container.appendChild(particle);
  }
})();
