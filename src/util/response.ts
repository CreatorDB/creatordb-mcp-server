import type { ApiResponse } from './api-client.js';

export function formatToolResult(response: ApiResponse) {
  if (!response.success) {
    const detail =
      response.errorDescription ||
      response.message ||
      response.error ||
      'Request failed';
    const lines = [
      `Error: ${response.errorCode || response.error || 'UNKNOWN'}`,
      detail,
      `TraceId: ${response.traceId}`,
    ];
    if (response.details) {
      lines.push(`Details: ${JSON.stringify(response.details)}`);
    }
    return {
      isError: true as const,
      content: [
        {
          type: 'text' as const,
          text: lines.join('\n'),
        },
      ],
    };
  }

  const creditInfo = [
    `Credits used: ${response.creditsUsed}`,
    response.creditsAvailable >= 0 ? `Remaining: ${response.creditsAvailable}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(response.data, null, 2),
      },
      {
        type: 'text' as const,
        text: creditInfo,
      },
    ],
  };
}
