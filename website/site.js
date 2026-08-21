import { scrollProgress, storyFrame } from './motion.js';

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const header = document.querySelector('[data-header]');
const story = document.querySelector('[data-scroll-story]');
const storyCopies = [...document.querySelectorAll('[data-story-copy]')];
const storyCards = [...document.querySelectorAll('[data-story-card]')];
const reveals = [...document.querySelectorAll('[data-reveal]')];

root.classList.add('js');
requestAnimationFrame(() => root.classList.add('motion-ready'));

for (const link of document.querySelectorAll('[data-download-location]')) {
  link.addEventListener('click', () => {
    window.plausible('Download', {
      props: {
        location: link.dataset.downloadLocation,
        platform: link.dataset.platform || 'unknown',
        target: link.href,
      },
    });
  });
}

if (reducedMotion.matches || !('IntersectionObserver' in window)) {
  reveals.forEach((element) => element.classList.add('is-visible'));
} else {
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      entry.target.classList.toggle('is-visible', entry.isIntersecting);
    }
  }, { rootMargin: '-7% 0px -7% 0px', threshold: 0.06 });
  reveals.forEach((element) => revealObserver.observe(element));
}

const updateStory = () => {
  if (!story || reducedMotion.matches) return;
  const bounds = story.getBoundingClientRect();
  const progress = scrollProgress({
    top: bounds.top,
    height: bounds.height,
    viewportHeight: window.innerHeight,
  });
  const frame = storyFrame(progress, storyCards.length);
  story.dataset.chapter = String(frame.chapter);
  storyCopies.forEach((copy, index) => copy.classList.toggle('is-active', index === frame.chapter));
  storyCards.forEach((card, index) => {
    const state = frame.cards[index];
    card.style.setProperty('--card-x', state.x);
    card.style.setProperty('--card-y', state.y);
    card.style.setProperty('--card-rotate', state.rotate);
    card.style.setProperty('--card-scale', state.scale);
    card.style.setProperty('--card-opacity', state.opacity);
    card.style.setProperty('--card-z', state.z);
  });
};

let frameRequested = false;
const updatePage = () => {
  header?.classList.toggle('is-scrolled', window.scrollY > 24);
  updateStory();
  frameRequested = false;
};

const requestPageUpdate = () => {
  if (frameRequested) return;
  frameRequested = true;
  requestAnimationFrame(updatePage);
};

window.addEventListener('scroll', requestPageUpdate, { passive: true });
window.addEventListener('resize', requestPageUpdate, { passive: true });
reducedMotion.addEventListener?.('change', requestPageUpdate);
requestPageUpdate();
