export function foPrompt(task, intent, selected = null) {
  const context = [
    `Task: ${task.title}`,
    `Details provided by the owner: ${task.description || 'None'}`,
    `Deadline: ${task.deadline || 'Not specified'}`,
    `Budget: ${task.budget == null ? 'No limit specified; ask before any spending' : `$${task.budget.toFixed(2)} USD`}`,
    `Current task status: ${task.status}`,
    `Current Fo conversation ID: ${task.fo?.externalId || 'none'}`
  ].join('\n');
  if (intent === 'book') {
    if (!selected || task.status !== 'approved') throw new Error('Approve a specific option before booking.');
    return `${context}\n\nThe owner explicitly approved this option: ${selected.vendor}, quoted at $${selected.price.toFixed(2)} USD, availability ${selected.availability || 'not recorded'}. Ask for confirmation of the exact vendor, final price, and timing. You may arrange or book this specific option only if the final total is no more than $${selected.price.toFixed(2)} USD and no deposit, card details, or other payment is required. If anything changes, stop and ask for new approval. Return the actual confirmation number or link, or say clearly that booking is unconfirmed. Do not report the task complete; physical outcome will be verified separately.`;
  }
  if (intent === 'recover') {
    return `${context}\n\nA setback occurred. Find the next permitted path: try another relevant provider or ask a precise question if needed. You may contact up to three providers about availability and quotes, sharing only the task details above. Do not book, purchase, commit funds, disclose account details, or claim completion. Explain what failed, what you tried next, and any quote or approval needed.`;
  }
  if (intent === 'research') {
    return `${context}\n\nYou have permission to contact up to three relevant providers to check availability and collect itemized quotes. Share only the task details above. Do not book, purchase, commit funds, disclose account details, or claim completion. Report each provider's name, actual response, total price, availability, and what remains unverified. Ask the owner for any missing detail needed to proceed.`;
  }
  throw new Error('Unknown Fo action.');
}
