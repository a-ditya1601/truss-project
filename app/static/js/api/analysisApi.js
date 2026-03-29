async function solveTruss(data) {
  const response = await fetch("/api/solve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  const payload = await response.json().catch(() => ({
    success: false,
    error: "Server returned an unreadable response.",
  }));

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Failed to solve the truss.");
  }

  console.log(payload.data);
  return payload.data;
}

window.solveTruss = solveTruss;
