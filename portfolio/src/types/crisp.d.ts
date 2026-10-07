export {};

declare global {
  interface Window {
    /** Crisp chat command queue (set by the Crisp bootstrap script). */
    $crisp?: {
      push: (args: unknown[]) => void;
    };
    /** Crisp website ID, set before loading the Crisp client script. */
    CRISP_WEBSITE_ID?: string;
  }
}
