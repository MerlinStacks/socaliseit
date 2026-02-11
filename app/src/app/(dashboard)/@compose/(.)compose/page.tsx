/**
 * Intercepting route for compose page
 * Why: When navigating from within the app (e.g. calendar),
 * this intercepts the /compose route and renders the compose page
 * as a modal overlay on top of the current page instead of navigating away.
 * Direct URL visits still render the standalone compose/page.tsx.
 */

import ComposePage from '../../compose/page';

export default ComposePage;
