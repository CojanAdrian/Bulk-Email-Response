import '@testing-library/jest-dom';

// jsdom has no canvas; the map checks for a missing context and draws nothing.
HTMLCanvasElement.prototype.getContext = () => null;
