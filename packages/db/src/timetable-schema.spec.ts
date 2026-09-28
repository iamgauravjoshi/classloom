import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as dbExports from './index.js';
import * as schema from './schema.js';

describe('weekly timetable schema', () => {
  it('exports timetable, slot, and event tables through the package entrypoint', () => {
    for (const name of ['weeklyTimetables', 'weeklyTimetableSlots', 'weeklyTimetableEvents'] as const) {
      expect(schema[name], `${name} schema export`).toBeDefined();
      expect(dbExports, `${name} db export`).toHaveProperty(name);
    }
  });

  it('stores school/session scope, weekly slot fields, and actor audit events', () => {
    const timetableColumns = getTableColumns(schema.weeklyTimetables);
    for (const name of ['id', 'tenantId', 'schoolId', 'sessionId', 'status', 'publishedAt', 'createdByMembershipId', 'updatedByMembershipId']) {
      expect(timetableColumns, `weeklyTimetables.${name}`).toHaveProperty(name);
    }
    const slotColumns = getTableColumns(schema.weeklyTimetableSlots);
    for (const name of ['id', 'tenantId', 'schoolId', 'timetableId', 'sessionId', 'sectionId', 'subjectId', 'teacherAssignmentId', 'weekday', 'startTime', 'endTime', 'roomLabel', 'demoKey']) {
      expect(slotColumns, `weeklyTimetableSlots.${name}`).toHaveProperty(name);
    }
    const eventColumns = getTableColumns(schema.weeklyTimetableEvents);
    for (const name of ['id', 'tenantId', 'schoolId', 'timetableId', 'slotId', 'actorAccountId', 'actorMembershipId', 'eventType', 'createdAt']) {
      expect(eventColumns, `weeklyTimetableEvents.${name}`).toHaveProperty(name);
    }
  });

  it('enforces tenant RLS, school/session and composite references, and schedule constraints', () => {
    for (const table of [schema.weeklyTimetables, schema.weeklyTimetableSlots, schema.weeklyTimetableEvents]) {
      const config = getTableConfig(table);
      expect(config.enableRLS).toBe(true);
      expect(config.policies.map((policy) => policy.name)).toContain('tenant_isolation');
    }
    const timetableConfig = getTableConfig(schema.weeklyTimetables);
    expect(timetableConfig.uniqueConstraints.some(({ name }) => name === 'weekly_timetables_tenant_school_id_unique')).toBe(true);
    expect(timetableConfig.indexes.some(({ config }) => config.name === 'weekly_timetables_session_unique')).toBe(true);
    expect(timetableConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(expect.arrayContaining([
      'weekly_timetables_created_by_tenant_membership_fk', 'weekly_timetables_updated_by_tenant_membership_fk',
    ]));
    const slotConfig = getTableConfig(schema.weeklyTimetableSlots);
    expect(slotConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(expect.arrayContaining([
      'weekly_timetable_slots_parent_fk', 'weekly_timetable_slots_section_fk', 'weekly_timetable_slots_subject_fk', 'weekly_timetable_slots_teacher_assignment_fk',
      'weekly_timetable_slots_created_by_tenant_membership_fk', 'weekly_timetable_slots_updated_by_tenant_membership_fk',
    ]));
    expect(slotConfig.checks.map(({ name }) => name)).toEqual(expect.arrayContaining([
      'weekly_timetable_slots_weekday_check', 'weekly_timetable_slots_time_check',
    ]));
    expect(slotConfig.indexes.some(({ config }) => config.name === 'weekly_timetable_slots_demo_key_unique')).toBe(true);
  });
});
