/**
 * Default slot for compose parallel route
 * Why: Returns null when the compose modal is not active,
 * allowing the underlying page (e.g. calendar) to render without interference.
 */
export default function ComposeDefault() {
    return null;
}
