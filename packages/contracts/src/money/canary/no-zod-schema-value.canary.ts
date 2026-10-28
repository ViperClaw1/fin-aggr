// depcruise: money-checks-without-zod
// A value import of a schema module from zod-free money code pulls zod into the client.
import { Cents } from '../cents';

export const c = Cents.parse(1);
