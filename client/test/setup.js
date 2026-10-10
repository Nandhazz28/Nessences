import { configure } from '@testing-library/react';

// Lazy route chunks and effects can take well over a second on a cold cache or a busy CI machine.
configure({ asyncUtilTimeout: 5000 });
