import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { authService } from '../../../services/auth';
import {
  sanitizePhoneInput,
  isValidIndianPhone,
  isValidFullName,
  isValidPastDate,
  isValidRegistrationNumber,
  isValidWordsField,
  isValidFreeTextField,
} from '../../../utils/formValidation';
import {
  X,
  User,
  ShieldCheck,
  Stethoscope,
  Save,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Heart,
  Phone,
  Building2,
  FileCheck,
  Upload,
  FileText,
  Award,
  Briefcase,
  MapPin,
  Sparkles,
} from 'lucide-react';

export default function SettingsModal({ isOpen, onClose }) {
  const { user, token, updateProfile: updateAuthProfile, uploadDocument } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [regCertificateFile, setRegCertificateFile] = useState(null);
  const fileInputRef = useRef(null);
  const patientReferenceId = user?.patient_code || user?.patientCode || user?.id || 'Not available';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'patient',
    dob: '',
    bloodGroup: '',
    gender: 'Male',
    emergencyContact: '',
    // Doctor Registration Credentials
    regNumber: '',
    council: '',
    degree: '',
    specialization: '',
    experience: 5,
    hospitalName: '',
    address: '',
    regCertificateUrl: '',
  });

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || user.fullName || '',
        email: user.email || '',
        phone: user.phone || user.mobile || '',
        role: user.role || 'patient',
        dob: user.dob || user.dateOfBirth || user.date_of_birth || '',
        bloodGroup: user.bloodGroup || user.blood_group || user.blood_type || '',
        gender: user.gender || 'Male',
        emergencyContact: user.emergencyContact || user.emergency_contact || '',
        regNumber: user.regNumber || user.licenseNumber || user.license_number || '',
        council: user.council || 'National Medical Commission (NMC)',
        degree: user.degree || 'MBBS',
        specialization: user.specialization || user.specialty || '',
        experience: user.experience !== undefined ? user.experience : 5,
        hospitalName: user.hospitalName || user.hospital_name || '',
        address: user.address || user.hospital_address || '',
        regCertificateUrl: user.regCertificateUrl || user.reg_certificate_url || user.certificateUrl || '',
      });
      setRegCertificateFile(null);
    }
  }, [user, isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setRegCertificateFile(file);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);

    const cleanedPhone = sanitizePhoneInput(formData.phone);
    if (!isValidIndianPhone(cleanedPhone)) {
      setMessage({ type: 'error', text: 'Please enter a valid 10-digit mobile number.' });
      setIsSaving(false);
      return;
    }

    if (!isValidFullName(formData.name)) {
      setMessage({ type: 'error', text: 'Please enter a valid full name using letters only.' });
      setIsSaving(false);
      return;
    }

    // Role-specific mandatory field validations
    if (formData.role === 'patient') {
      if (!formData.name || !formData.dob || !formData.bloodGroup || !formData.gender) {
        setMessage({
          type: 'error',
          text: 'All patient credentials (Full Name, Date of Birth, Gender, Blood Group, and Mobile Phone) are mandatory.',
        });
        setIsSaving(false);
        return;
      }
      if (!isValidPastDate(formData.dob)) {
        setMessage({ type: 'error', text: 'Please enter a valid date of birth.' });
        setIsSaving(false);
        return;
      }
    }

    if (formData.role === 'doctor') {
      if (
        !formData.name ||
        !formData.dob ||
        !formData.regNumber ||
        !formData.council ||
        !formData.degree ||
        !formData.specialization ||
        !formData.hospitalName ||
        !formData.address
      ) {
        setMessage({
          type: 'error',
          text: 'All doctor credentials (Full Name, Date of Birth, Registration Number, Medical Council, Degree, Specialization, Hospital Name, and Practice Address) are mandatory.',
        });
        setIsSaving(false);
        return;
      }

      if (!isValidPastDate(formData.dob, { minAge: 21, maxAge: 100 })) {
        setMessage({ type: 'error', text: 'Please enter a valid date of birth (doctors must be at least 21 years old).' });
        setIsSaving(false);
        return;
      }

      if (!isValidRegistrationNumber(formData.regNumber)) {
        setMessage({ type: 'error', text: 'Please enter a valid Medical Registration Number (must include at least one digit).' });
        setIsSaving(false);
        return;
      }

      if (!isValidWordsField(formData.degree) || !isValidWordsField(formData.specialization)) {
        setMessage({ type: 'error', text: 'Please enter a valid Degree and Specialization (letters only).' });
        setIsSaving(false);
        return;
      }

      if (!isValidFreeTextField(formData.hospitalName, { minLength: 3, maxLength: 150 })) {
        setMessage({ type: 'error', text: 'Please enter a valid Hospital or Clinic Name.' });
        setIsSaving(false);
        return;
      }

      if (!isValidFreeTextField(formData.address, { minLength: 8, maxLength: 300 })) {
        setMessage({ type: 'error', text: 'Please enter a valid, complete practice address.' });
        setIsSaving(false);
        return;
      }

      if (!regCertificateFile && !formData.regCertificateUrl) {
        setMessage({
          type: 'error',
          text: 'Medical Registration Certificate is required. Please upload your official medical council certificate file.',
        });
        setIsSaving(false);
        return;
      }
    }

    try {
      let uploadedCertUrl = formData.regCertificateUrl;

      // Upload file if new document provided
      if (regCertificateFile && uploadDocument) {
        setMessage({ type: 'info', text: 'Uploading registration certificate document...' });
        const res = await uploadDocument(regCertificateFile);
        uploadedCertUrl = res.url || res.fileUrl;
      }

      const payload = {
        ...formData,
        name: formData.name,
        fullName: formData.name,
        phone: cleanedPhone,
        mobile: cleanedPhone,
        dob: formData.dob,
        dateOfBirth: formData.dob,
        bloodGroup: formData.bloodGroup,
        blood_group: formData.bloodGroup,
        blood_type: formData.bloodGroup,
        gender: formData.gender,
        emergencyContact: formData.emergencyContact,
        regNumber: formData.regNumber,
        licenseNumber: formData.regNumber,
        specialization: formData.specialization,
        specialty: formData.specialization,
        council: formData.council,
        degree: formData.degree,
        experience: formData.experience,
        hospitalName: formData.hospitalName,
        address: formData.address,
        regCertificateUrl: uploadedCertUrl,
        isSettingsUpdate: true,
      };

      // Save all fields directly into Supabase database users table
      let updateRes = null;
      if (updateAuthProfile) {
        updateRes = await updateAuthProfile(payload);
      } else {
        updateRes = await authService.updateProfile(payload, token);
      }

      const certExtracted = updateRes?.extractedCertificateData;
      const successText = certExtracted
        ? 'Account & Medical Council credentials verified via Vision AI and updated in database!'
        : 'Account credentials and profile data updated successfully in database!';

      setMessage({ type: 'success', text: successText });

      setTimeout(() => {
        setMessage(null);
        onClose();
      }, 1500);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update account credentials in database.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 ">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 ">
              <User size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">
                Account Settings
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Update your personal details and accreditation
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSave} className="p-6 space-y-6 max-h-[82vh] overflow-y-auto">
          {message && (
            <div
              className={`p-3.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold ${message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 '
                  : message.type === 'info'
                    ? 'bg-blue-50 text-blue-800 border border-blue-200 '
                    : 'bg-rose-50 text-rose-800 border border-rose-200 '
                }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 size={16} />
              ) : message.type === 'info' ? (
                <Sparkles size={16} className="animate-spin" />
              ) : (
                <AlertCircle size={16} />
              )}
              {message.text}
            </div>
          )}

          {/* 1. Account Type Indicator (read-only — role is fixed at registration) */}
          <div>
            <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-2">
              Account Type
            </label>
            <div
              className={`flex items-center gap-3 p-4 rounded-2xl border ${formData.role === 'doctor'
                  ? 'bg-indigo-50/80 border-indigo-500 text-indigo-950 '
                  : 'bg-emerald-50/80 border-emerald-500 text-emerald-950 '
                }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white shadow-md ${formData.role === 'doctor' ? 'bg-indigo-600' : 'bg-emerald-600'
                  }`}
              >
                {formData.role === 'doctor' ? <Stethoscope size={22} /> : <ShieldCheck size={22} />}
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider">
                  {formData.role === 'doctor' ? 'Doctor Account' : 'Patient Account'}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {formData.role === 'doctor' ? 'Clinical dashboard & patient search' : 'Timeline, health vault & family records'}
                </p>
              </div>
            </div>
          </div>

          {/* 2. Personal Information Section */}
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <User size={16} className="text-blue-600 " />
              Personal Credentials & Contact Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                  placeholder="e.g. Dr. Jane Doe"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  value={formData.email}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 text-xs font-semibold cursor-not-allowed"
                />
              </div>

              {formData.role === 'patient' && (
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Patient ID / User ID
                  </label>
                  <input
                    type="text"
                    disabled
                    value={patientReferenceId}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold cursor-not-allowed"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  inputMode="numeric"
                  maxLength={10}
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: sanitizePhoneInput(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                  placeholder="98765 43210"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                  Date of Birth <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  max={new Date().toISOString().split('T')[0]}
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                />
              </div>

              {formData.role === 'patient' && (
                <>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      Blood Group <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.bloodGroup}
                      onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all bg-white "
                    >
                      <option value="" disabled>Select Blood Group</option>
                      <option value="A+">A+</option>
                      <option value="A-">A-</option>
                      <option value="B+">B+</option>
                      <option value="B-">B-</option>
                      <option value="O+">O+</option>
                      <option value="O-">O-</option>
                      <option value="AB+">AB+</option>
                      <option value="AB-">AB-</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      Gender
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all bg-white "
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 3. Doctor Mandatory Registration Credentials */}
          {formData.role === 'doctor' && (
            <div className="pt-4 border-t border-slate-100 space-y-4 animate-in fade-in duration-200">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Stethoscope size={16} className="text-indigo-600 " />
                Medical Accreditation & License Credentials
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Medical Registration Number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={30}
                    value={formData.regNumber}
                    onChange={(e) => setFormData({ ...formData, regNumber: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    placeholder="e.g. MCI-12345"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Medical Council <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.council}
                    onChange={(e) => setFormData({ ...formData, council: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:outline-none bg-white "
                  >
                    <option value="National Medical Commission (NMC)">National Medical Commission (NMC)</option>
                    <option value="State Medical Council">State Medical Council</option>
                    <option value="Dental Council of India">Dental Council of India</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Primary Degree <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.degree}
                    onChange={(e) => setFormData({ ...formData, degree: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    placeholder="e.g. MBBS, MD, MS"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Specialization <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.specialization}
                    onChange={(e) => setFormData({ ...formData, specialization: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    placeholder="e.g. Cardiology, Neurology"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Years of Clinical Experience: <span className="text-indigo-600 font-bold">{formData.experience} yrs</span>
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="50"
                    step="1"
                    value={formData.experience}
                    onChange={(e) => setFormData({ ...formData, experience: e.target.value })}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Hospital or Primary Clinic Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.hospitalName}
                    onChange={(e) => setFormData({ ...formData, hospitalName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    placeholder="Name of primary practice"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    Full Practice Address <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                    placeholder="Enter practice address"
                  />
                </div>
              </div>

              {/* Doctor Medical Certificate Upload */}
              <div className="pt-2">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1.5">
                  Official Medical Registration Certificate Document <span className="text-rose-500">*</span>
                </label>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/80 rounded-2xl p-4 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
                    <Upload size={20} />
                  </div>
                  <div>
                    {regCertificateFile ? (
                      <p className="text-xs font-extrabold text-indigo-700 flex items-center justify-center gap-1.5">
                        <FileCheck size={16} />
                        {regCertificateFile.name} (Ready to upload)
                      </p>
                    ) : formData.regCertificateUrl ? (
                      <p className="text-xs font-extrabold text-emerald-700 flex items-center justify-center gap-1.5">
                        <CheckCircle2 size={16} />
                        Certificate On File (Click to replace document)
                      </p>
                    ) : (
                      <>
                        <p className="text-xs font-extrabold text-slate-800 ">
                          Click to upload your Medical Registration Certificate
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Supports PDF, PNG, JPG (Scanned via Gemini Vision AI)
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
            >
              <Save size={16} />
              {isSaving ? 'Saving & Verifying...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
