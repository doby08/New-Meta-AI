import React, { useState } from 'react';
export type Lang = 'EN' | 'TL';
export interface Strings {
  header: string; subtitle: string;
  cardTitle: string; cardSubtitle: string;
  titleLabel: string; titlePh: string;
  typeLabel: string; typeOptions: string[];
  methodLabel: string; methodOptions: string[];
  formatLabel: string; formatOptions: string[];
  descLabel: string; descPh: string;
  stakeholdersLabel: string; stakeholdersPh: string;
  intervieweeLabel: string; intervieweePh: string;
  dateLabel: string; countLabel: string;
  backBtn: string; submitBtn: string; requiredError: string;
}
export const STRINGS: Record<Lang, Strings> = {
