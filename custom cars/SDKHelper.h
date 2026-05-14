#pragma once

#include <inttypes.h>
#include <exception>
#include <GalacticInterfaces.h>
#include <GalacticStrongPtr.h>

#pragma region "Internal"
#if defined(_MSC_VER)
#define DLL_EXPORT __declspec(dllexport)
#elif defined(__GNUC__)
#define DLL_EXPORT __attribute__((visibility("default")))
#else
#define DLL_EXPORT
#endif

class GException : public std::exception
{
public:
    inline GException(Galactic3D::Result Result) :
        m_Result(Result)
    {
    }

    Galactic3D::Result m_Result;

    virtual char const* what() const throw () override
    {
        switch (m_Result)
        {
            case Galactic3D::RESULT_ERROR:
                return "An error occurred.";
            case Galactic3D::RESULT_NOTIMPLEMENTED:
                return "Not implemented.";
            case Galactic3D::RESULT_OUTOFMEMORY:
                return "Out of memory.";
            case Galactic3D::RESULT_BADARGUMENT:
                return "Bad argument.";
            case Galactic3D::RESULT_NOTFOUND:
                return "Not found.";
            case Galactic3D::RESULT_BADPOINTER:
                return "Bad pointer.";
            case Galactic3D::RESULT_BADCALL:
                return "Bad call.";
            case Galactic3D::RESULT_OK:
                return "The operation completed successfully.";
            case Galactic3D::RESULT_FALSE:
                return "False.";
            default:
                break;
        }
        return "An unknown error occurred.";
    }
};

#define GALACTIC_CALL(x) \
{ \
    Galactic3D::Result r = x; \
    if (Galactic3D::Failed(r)) \
    { \
        throw GException(r); \
    } \
}

#define SDK_TRY try {
#define SDK_ENDTRY } \
    catch (std::exception& e) \
    { \
        pState->SetError("%s", e.what()); \
        return false; \
    } \
    catch (std::nullptr_t) \
    { \
        return false; \
    }
#define SDK_PROPAGATE_ERROR throw nullptr;

class CModule
{
public:
    Galactic3D::Strong<Galactic3D::Interfaces::IModuleInterface> m_pModuleInterface;
    Galactic3D::Strong<Galactic3D::Interfaces::IArgumentFactory> m_pArgumentFactory;
    Galactic3D::Strong<Galactic3D::Interfaces::IReflectedNamespace> m_pNamespace;
};

extern void ModuleRegister();
extern void ModuleUnregister();

static CModule* g_pModule;

inline void* RegisterModule(void*, Galactic3D::Interfaces::IModuleInterface* pModuleInterface, const char* pszModuleName)
{
    GALACTIC_CALL(pModuleInterface->SetInternalName(pszModuleName));

    CModule* pModule = new CModule;
    pModule->m_pModuleInterface = pModuleInterface;

    g_pModule = pModule;

    GALACTIC_CALL(pModuleInterface->CreateInstance(Galactic3D::Interfaces::ID_ArgumentFactory, (void**)&pModule->m_pArgumentFactory));
    GALACTIC_CALL(pModuleInterface->GetNamespace(&pModule->m_pNamespace));

    ModuleRegister();

    return pModule;
}

#define MODULE_MAIN(MODULE_NAME) \
    extern "C" DLL_EXPORT void* RegisterModule(void* p, Galactic3D::Interfaces::IModuleInterface* pModuleInterface) { return RegisterModule(p, pModuleInterface, MODULE_NAME); } \
    extern "C" DLL_EXPORT void UnregisterModule(void* pUser) { ModuleUnregister(); delete (CModule*)pUser; }
#pragma endregion

namespace SDK
{
    inline void RegisterFunction(const char* pszName, Galactic3D::Interfaces::IScriptFunctionCallback pFunction, void* pUser = nullptr)
    {
        GALACTIC_CALL(g_pModule->m_pNamespace->RegisterFunction(pszName, "", pFunction, pUser));
    }

    inline void AddProperty(const char* pszName, Galactic3D::Interfaces::IScriptFunctionCallback pGetter, Galactic3D::Interfaces::IScriptFunctionCallback pSetter = nullptr, void* pUser = nullptr)
    {
        GALACTIC_CALL(g_pModule->m_pNamespace->AddProperty(pUser, pszName, 0, pGetter, pSetter));
    }

    class State
    {
    public:
        inline State(Galactic3D::Interfaces::INativeState* pState)
        {
            m_pNativeState = pState;
        }

        Galactic3D::Strong<Galactic3D::Interfaces::INativeState> m_pNativeState;

        inline operator Galactic3D::Interfaces::INativeState*()
        {
            return m_pNativeState;
        }

        inline const char* CheckString(size_t Index, size_t* pLength = nullptr)
        {
            const char* psz = m_pNativeState->CheckString(Index, pLength);
            if (!psz)
                SDK_PROPAGATE_ERROR;
            return psz;
        }

        inline void CheckNumber(size_t Index, int32_t& Value)
        {
            if (!m_pNativeState->CheckInt32(Index, Value))
                SDK_PROPAGATE_ERROR;
        }

        inline void Return(Galactic3D::Interfaces::IArgument* pArgument)
        {
            GALACTIC_CALL(m_pNativeState->Return(pArgument));
        }
    };

    class BooleanValue
    {
    public:
        inline BooleanValue(bool bValue)
        {
            GALACTIC_CALL(g_pModule->m_pArgumentFactory->CreateBoolean(&m_pArgument, bValue));
        }

        Galactic3D::Strong<Galactic3D::Interfaces::IArgument> m_pArgument;

        inline operator Galactic3D::Interfaces::IArgument*()
        {
            return m_pArgument;
        }
    };

    class StringValue
    {
    public:
        inline StringValue(const char* psz)
        {
            GALACTIC_CALL(g_pModule->m_pArgumentFactory->CreateStringZ(&m_pArgument, psz));
        }

        Galactic3D::Strong<Galactic3D::Interfaces::IArgument> m_pArgument;

        inline operator Galactic3D::Interfaces::IArgument*()
        {
            return m_pArgument;
        }
    };
}
