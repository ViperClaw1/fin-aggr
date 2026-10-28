// depcruise: gateway-impl-dynamic-only
// A static import of a gateway implementation puts the mock and its fixtures in the bundle.
import { createMockGateway } from '../gateway.mock';

export const g = createMockGateway;
