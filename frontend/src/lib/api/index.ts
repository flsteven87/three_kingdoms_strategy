/**
 * API Client - Unified Export
 *
 * Provides backward-compatible apiClient object and modular exports.
 *
 * Usage:
 *   // Backward compatible (existing code works as-is)
 *   import { apiClient } from '@/lib/api-client'
 *   await apiClient.getAlliance()
 *
 *   // Or use new modular imports for tree-shaking
 *   import { getAlliance } from '@/lib/api'
 *   await getAlliance()
 */

// Re-export base client utilities
export { setAuthToken } from './base-client'

// Re-export all API functions for modular usage
export * from './alliance-api'
export * from './season-api'
export * from './upload-api'
export * from './hegemony-api'
export * from './analytics-api'
export * from './event-api'
export * from './donation-api'
export * from './line-api'
export * from './copper-mine-api'

// Import all functions for backward-compatible apiClient object
import { setAuthToken } from './base-client'
import * as allianceApi from './alliance-api'
import * as seasonApi from './season-api'
import * as uploadApi from './upload-api'
import * as hegemonyApi from './hegemony-api'
import * as analyticsApi from './analytics-api'
import * as eventApi from './event-api'
import * as donationApi from './donation-api'
import * as lineApi from './line-api'
import * as copperMineApi from './copper-mine-api'

/**
 * Backward-compatible API client object
 *
 * This maintains the same interface as the original ApiClient class.
 * Existing code using `apiClient.methodName()` will continue to work.
 */
export const apiClient = {
  // Auth
  setAuthToken,

  // Alliance
  getAlliance: allianceApi.getAlliance,
  createAlliance: allianceApi.createAlliance,
  updateAlliance: allianceApi.updateAlliance,
  deleteAlliance: allianceApi.deleteAlliance,
  getCollaborators: allianceApi.getCollaborators,
  addCollaborator: allianceApi.addCollaborator,
  removeCollaborator: allianceApi.removeCollaborator,
  processPendingInvitations: allianceApi.processPendingInvitations,
  updateCollaboratorRole: allianceApi.updateCollaboratorRole,
  getMyRole: allianceApi.getMyRole,

  // Season
  getSeasons: seasonApi.getSeasons,
  getActiveSeason: seasonApi.getActiveSeason,
  getSeason: seasonApi.getSeason,
  createSeason: seasonApi.createSeason,
  updateSeason: seasonApi.updateSeason,
  deleteSeason: seasonApi.deleteSeason,
  activateSeason: seasonApi.activateSeason,

  // CSV Upload
  getCsvUploads: uploadApi.getCsvUploads,
  uploadCsv: uploadApi.uploadCsv,
  deleteCsvUpload: uploadApi.deleteCsvUpload,

  // Hegemony Weight
  getHegemonyWeights: hegemonyApi.getHegemonyWeights,
  getHegemonyWeightsSummary: hegemonyApi.getHegemonyWeightsSummary,
  initializeHegemonyWeights: hegemonyApi.initializeHegemonyWeights,
  createHegemonyWeight: hegemonyApi.createHegemonyWeight,
  updateHegemonyWeight: hegemonyApi.updateHegemonyWeight,
  deleteHegemonyWeight: hegemonyApi.deleteHegemonyWeight,
  previewHegemonyScores: hegemonyApi.previewHegemonyScores,

  // Analytics - Member
  getAnalyticsMembers: analyticsApi.getAnalyticsMembers,
  getMemberTrend: analyticsApi.getMemberTrend,
  getMemberSeasonSummary: analyticsApi.getMemberSeasonSummary,

  // Analytics - Period
  getPeriodAverages: analyticsApi.getPeriodAverages,
  recalculateSeasonPeriods: analyticsApi.recalculateSeasonPeriods,

  // Analytics - Alliance
  getAllianceTrend: analyticsApi.getAllianceTrend,
  getSeasonAverages: analyticsApi.getSeasonAverages,
  getAllianceAnalytics: analyticsApi.getAllianceAnalytics,

  // Analytics - Group
  getGroups: analyticsApi.getGroups,
  getGroupAnalytics: analyticsApi.getGroupAnalytics,
  getGroupsComparison: analyticsApi.getGroupsComparison,

  // Event
  getEvents: eventApi.getEvents,
  getEvent: eventApi.getEvent,
  getEventAnalytics: eventApi.getEventAnalytics,
  createEvent: eventApi.createEvent,
  uploadEventCsv: eventApi.uploadEventCsv,
  processEvent: eventApi.processEvent,
  deleteEvent: eventApi.deleteEvent,

  // Donation
  getDonations: donationApi.getDonations,
  getDonationDetail: donationApi.getDonationDetail,
  createDonation: donationApi.createDonation,
  deleteDonation: donationApi.deleteDonation,
  upsertMemberTargetOverride: donationApi.upsertMemberTargetOverride,
  deleteMemberTargetOverride: donationApi.deleteMemberTargetOverride,

  // LINE Binding
  getLineBindingStatus: lineApi.getLineBindingStatus,
  generateLineBindingCode: lineApi.generateLineBindingCode,
  unbindLineGroup: lineApi.unbindLineGroup,
  getRegisteredMembers: lineApi.getRegisteredMembers,
  getLineCustomCommands: lineApi.getLineCustomCommands,
  createLineCustomCommand: lineApi.createLineCustomCommand,
  updateLineCustomCommand: lineApi.updateLineCustomCommand,
  deleteLineCustomCommand: lineApi.deleteLineCustomCommand,

  // Copper Mine
  getCopperMineRules: copperMineApi.getCopperMineRules,
  createCopperMineRule: copperMineApi.createCopperMineRule,
  updateCopperMineRule: copperMineApi.updateCopperMineRule,
  deleteCopperMineRule: copperMineApi.deleteCopperMineRule,
  getCopperMineOwnerships: copperMineApi.getCopperMineOwnerships,
  createCopperMineOwnership: copperMineApi.createCopperMineOwnership,
  updateCopperMineOwnership: copperMineApi.updateCopperMineOwnership,
  deleteCopperMineOwnership: copperMineApi.deleteCopperMineOwnership,
}
