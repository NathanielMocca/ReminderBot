import type { CreateReminderInput, UpdateReminderInput } from "@reminder/shared";

const SERVER_BASE_URL = process.env.SERVER_BASE_URL ?? "http://localhost:8080";
const SERVER_API_TOKEN = process.env.SERVER_API_TOKEN ?? "";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${SERVER_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-token": SERVER_API_TOKEN,
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Server API error ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

export async function createReminder(input: CreateReminderInput): Promise<{ message: string }> {
  return request("/api/reminders", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function updateReminder(reminderId: string, input: UpdateReminderInput): Promise<{ message: string }> {
  return request(`/api/reminders/${reminderId}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export async function deleteReminder(reminderId: string): Promise<{ message: string }> {
  return request(`/api/reminders/${reminderId}`, {
    method: "DELETE"
  });
}

export async function listReminders(guildId: string): Promise<{ reminders: Array<{ reminderId: string; title: string; timeHHmm: string; scheduleType: string; enabled: boolean; timezone: string; weekdays: number[] }> }> {
  return request(`/api/reminders?guildId=${encodeURIComponent(guildId)}`, {
    method: "GET"
  });
}

export async function getGuildConfig(guildId: string): Promise<{ managerRoleIds: string[]; timezone: string }> {
  return request(`/api/reminders/guilds/${encodeURIComponent(guildId)}/config`, {
    method: "GET"
  });
}

export async function updateGuildTimezone(guildId: string, timezone: string): Promise<{ message: string }> {
  return request(`/api/reminders/guilds/${encodeURIComponent(guildId)}/timezone`, {
    method: "PUT",
    body: JSON.stringify({ timezone })
  });
}
