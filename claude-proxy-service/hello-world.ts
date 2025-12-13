/**
 * Returns a greeting message
 * @returns A hello world string
 */
export function helloWorld(): string {
  return 'Hello, World!';
}

// Example usage
if (require.main === module) {
  console.log(helloWorld());
}
