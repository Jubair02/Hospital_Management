import type { FilterQuery } from 'mongoose';
import Department, { type IDepartment } from '../models/Department.js';
import Doctor from '../models/Doctor.js';
import Appointment from '../models/Appointment.js';
import { nextSequenceId } from '../services/sequenceService.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * GET /api/departments
 * Admin sees everything; other roles see only active departments (they
 * need them for booking and display, not management).
 */
export const getDepartments = asyncHandler(async (req, res) => {
  const filter: FilterQuery<IDepartment> = {};

  if (req.user!.role !== 'admin') {
    filter.status = 'active';
  } else if (req.query.status === 'active' || req.query.status === 'inactive') {
    filter.status = req.query.status;
  }

  const departments = await Department.find(filter).sort({ name: 1 });

  res.json({ success: true, message: 'Departments fetched', data: { departments } });
});

/**
 * POST /api/departments — admin only.
 */
export const createDepartment = asyncHandler(async (req, res) => {
  const { name, description } = req.body as { name: string; description?: string };

  const department = await Department.create({
    departmentId: await nextSequenceId('departmentId', 'DEP', 3),
    name,
    description,
  });

  res.status(201).json({
    success: true,
    message: 'Department created successfully',
    data: { department },
  });
});

/**
 * GET /api/departments/:id — admin only (management detail view).
 */
export const getDepartmentById = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw new ApiError(404, 'Department not found');

  res.json({ success: true, message: 'Department fetched', data: { department } });
});

/**
 * PATCH /api/departments/:id — admin only.
 */
export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw new ApiError(404, 'Department not found');

  const { name, description } = req.body as { name?: string; description?: string };
  if (name !== undefined) department.name = name;
  if (description !== undefined) department.description = description;

  await department.save();

  res.json({ success: true, message: 'Department updated successfully', data: { department } });
});

/**
 * PATCH /api/departments/:id/status — admin only. Soft status only —
 * departments with doctors or appointments are never deleted, and
 * deactivation is blocked while active doctors remain assigned.
 */
export const updateDepartmentStatus = asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.id);
  if (!department) throw new ApiError(404, 'Department not found');

  const { status } = req.body as { status: 'active' | 'inactive' };

  if (status === 'inactive') {
    const activeDoctors = await Doctor.countDocuments({
      departmentId: department._id,
      status: 'active',
    });
    if (activeDoctors > 0) {
      throw new ApiError(
        400,
        `This department still has ${activeDoctors} active doctor(s). Reassign or deactivate them first.`
      );
    }
    const upcoming = await Appointment.countDocuments({
      departmentId: department._id,
      status: { $in: ['scheduled', 'confirmed'] },
    });
    if (upcoming > 0) {
      throw new ApiError(
        400,
        `This department still has ${upcoming} open appointment(s). Resolve them first.`
      );
    }
  }

  department.status = status;
  await department.save();

  res.json({
    success: true,
    message: `Department ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
    data: { department },
  });
});
