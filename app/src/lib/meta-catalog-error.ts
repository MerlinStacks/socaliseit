/** Only controlled, credential-free diagnostics may be shown or logged. */
export class MetaCatalogError extends Error {
    constructor(message: string, public readonly code?: number, public readonly subcode?: number) {
        super(message);
        this.name = 'MetaCatalogError';
    }
}
